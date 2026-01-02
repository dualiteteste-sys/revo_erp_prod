/*
  RES-01: Idempotência padrão em ações críticas

  Objetivo:
  - Criar infra de idempotency keys no DB (para dedupe de ações críticas).
  - Aplicar locks/guards em funções sensíveis a double-click (complementa OPS-01/02).

  Nota:
  - Mantém compatibilidade com o app atual (sem alterar assinaturas públicas de RPCs).
*/

BEGIN;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Infra: tabela de idempotency keys (server-side)
-- -----------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  key text not null,
  scope text not null default 'rpc',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint idempotency_keys_unique unique (empresa_id, scope, key)
);

alter table public.idempotency_keys enable row level security;
alter table public.idempotency_keys force row level security;

drop policy if exists idempotency_keys_deny_all on public.idempotency_keys;
create policy idempotency_keys_deny_all
  on public.idempotency_keys
  for all
  to authenticated
  using (false)
  with check (false);

grant select, insert, update, delete on table public.idempotency_keys to service_role;

create index if not exists idx_idempotency_keys_empresa_created_at on public.idempotency_keys(empresa_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 2) Helper: tenta adquirir idempotency key (retorna true se "primeira vez")
-- -----------------------------------------------------------------------------
drop function if exists public.idempotency_try_acquire(text, text, interval);
create function public.idempotency_try_acquire(
  p_key text,
  p_scope text default 'rpc',
  p_ttl interval default interval '24 hours'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_scope text := coalesce(nullif(btrim(p_scope),''),'rpc');
  v_key text := nullif(btrim(coalesce(p_key,'')), '');
begin
  if v_empresa is null then
    raise exception '[IDEMP] empresa_id inválido' using errcode='42501';
  end if;
  if v_key is null then
    raise exception '[IDEMP] key inválida' using errcode='22004';
  end if;

  -- Best-effort cleanup por empresa/escopo
  delete from public.idempotency_keys
  where empresa_id = v_empresa
    and scope = v_scope
    and created_at < (now() - coalesce(p_ttl, interval '24 hours'));

  insert into public.idempotency_keys(empresa_id, scope, key)
  values (v_empresa, v_scope, v_key)
  on conflict (empresa_id, scope, key)
  do update set last_seen_at = now();

  return (xmax = 0);
end;
$$;

revoke all on function public.idempotency_try_acquire(text, text, interval) from public;
grant execute on function public.idempotency_try_acquire(text, text, interval) to service_role;

-- -----------------------------------------------------------------------------
-- 3) Locks adicionais em RPCs críticos (double-click)
-- -----------------------------------------------------------------------------

-- 3.1) OS: gerar parcelas (lock por OS + idempotência por inputs)
DO $$
BEGIN
  IF to_regprocedure('public.os_generate_parcels_for_current_user(uuid,text,numeric,date)') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
  CREATE OR REPLACE FUNCTION public.os_generate_parcels_for_current_user(
    p_os_id uuid,
    p_cond text DEFAULT NULL::text,
    p_total numeric DEFAULT NULL::numeric,
    p_base_date date DEFAULT NULL::date
  )
  RETURNS SETOF public.ordem_servico_parcelas
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
  declare
    v_emp uuid := public.current_empresa_id();
    v_os public.ordem_servicos;
    v_cond text;
    v_total numeric(14,2);
    v_base date;
    v_tokens text[];
    v_due_dates date[] := '{}';
    v_last_due date;
    v_t text;
    v_n int;
    v_i int;
    v_sum numeric(14,2);
    v_each numeric(14,2);
    v_rest numeric(14,2);
    v_rows int;
    v_due date;
    v_idemp_key text;
    v_acquired boolean;
  begin
    if v_emp is null then
      raise exception '[RPC][OS][PARCELAS] empresa_id inválido' using errcode='42501';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_os_id::text, 0));

    select * into v_os
    from public.ordem_servicos
    where id = p_os_id and empresa_id = v_emp
    for update;

    if not found then
      raise exception '[RPC][OS][PARCELAS] OS não encontrada' using errcode='P0002';
    end if;

    v_cond  := coalesce(nullif(p_cond,''), v_os.condicao_pagamento);
    v_total := coalesce(p_total, v_os.total_geral);
    v_base  := coalesce(p_base_date, v_os.data_inicio, current_date);

    -- idempotência por inputs (evita delete/recreate em retries)
    v_idemp_key := 'os_parcelas:' || v_os.id::text || ':' || md5(coalesce(v_cond,'') || '|' || coalesce(v_total::text,'') || '|' || coalesce(v_base::text,''));
    v_acquired := public.idempotency_try_acquire(v_idemp_key, 'os', interval '24 hours');
    if not v_acquired then
      return query
      select *
      from public.ordem_servico_parcelas
      where empresa_id = v_emp and ordem_servico_id = v_os.id
      order by numero_parcela;
      return;
    end if;

    if coalesce(v_total,0) <= 0 then
      raise exception '[RPC][OS][PARCELAS] Total da OS inválido (<= 0)' using errcode='22003';
    end if;

    if v_cond is null or btrim(v_cond) = '' then
      v_due_dates := array_append(v_due_dates, v_base::date);
    else
      v_tokens := public.str_tokenize(v_cond);
      v_last_due := null;
      foreach v_t in array v_tokens loop
        v_t := btrim(v_t);
        if v_t ~ '^\d+$' then
          v_due_dates := array_append(v_due_dates, (v_base + (v_t::int) * interval '1 day')::date);
          v_last_due  := (v_base + (v_t::int) * interval '1 day')::date;
        elsif v_t ~ '^\+\d+x$' then
          v_n := regexp_replace(v_t, '[^\d]', '', 'g')::int;
          if v_n > 0 then
            if v_last_due is null then
              v_last_due := v_base;
            end if;
            for v_i in 1..v_n loop
              v_last_due := (v_last_due + interval '1 month')::date;
              v_due_dates := array_append(v_due_dates, v_last_due::date);
            end loop;
          end if;
        elsif v_t ~ '^\d+x$' then
          v_n := regexp_replace(v_t, '[^\d]', '', 'g')::int;
          if v_n > 0 then
            if v_last_due is null then
              v_last_due := v_base;
              v_due_dates := array_append(v_due_dates, v_last_due::date);
              for v_i in 2..v_n loop
                v_last_due := (v_last_due + interval '1 month')::date;
                v_due_dates := array_append(v_due_dates, v_last_due::date);
              end loop;
            else
              for v_i in 1..v_n loop
                v_last_due := (v_last_due + interval '1 month')::date;
                v_due_dates := array_append(v_due_dates, v_last_due::date);
              end loop;
            end if;
          end if;
        else
          continue;
        end if;
      end loop;

      if array_length(v_due_dates,1) is null then
        v_due_dates := array_append(v_due_dates, v_base::date);
      end if;
    end if;

    v_rows := array_length(v_due_dates,1);
    v_each := round((v_total / v_rows)::numeric, 2);
    v_sum  := v_each * v_rows;
    v_rest := round(v_total - v_sum, 2);

    delete from public.ordem_servico_parcelas
    where empresa_id = v_emp and ordem_servico_id = v_os.id;

    v_i := 0;
    foreach v_due in array v_due_dates loop
      v_i := v_i + 1;
      insert into public.ordem_servico_parcelas (
        empresa_id, ordem_servico_id, numero_parcela, vencimento, valor, status
      ) values (
        v_emp, v_os.id, v_i, v_due::date, v_each + case when v_i = v_rows then v_rest else 0 end, 'aberta'
      );
    end loop;

    perform public.os_recalc_totals(v_os.id);
    perform pg_notify('app_log', '[RPC] [OS][PARCELAS] ' || v_os.id::text || ' - ' || v_rows::text || ' parcela(s) geradas');

    return query
    select *
    from public.ordem_servico_parcelas
    where empresa_id = v_emp and ordem_servico_id = v_os.id
    order by numero_parcela;
  end;
  $function$;
  $sql$;
END $$;

-- 3.2) Financeiro: gerar contas a receber por parcelas (lock por OS)
DO $$
BEGIN
  IF to_regprocedure('public.financeiro_contas_a_receber_from_os_parcelas_create(uuid)') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
  CREATE OR REPLACE FUNCTION public.financeiro_contas_a_receber_from_os_parcelas_create(
    p_os_id uuid
  )
  RETURNS SETOF public.contas_a_receber
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $function$
  DECLARE
    v_empresa uuid := public.current_empresa_id();
    v_os public.ordem_servicos;
    v_parcela public.ordem_servico_parcelas;
  BEGIN
    PERFORM public.require_permission_for_current_user('contas_a_receber','create');

    IF v_empresa IS NULL THEN
      RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] Nenhuma empresa ativa encontrada' USING errcode = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_os_id::text, 0));

    IF to_regclass('public.ordem_servico_parcelas') IS NULL THEN
      RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] Tabela de parcelas não encontrada' USING errcode = 'P0002';
    END IF;

    SELECT * INTO v_os
    FROM public.ordem_servicos os
    WHERE os.id = p_os_id
      AND os.empresa_id = v_empresa
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] OS não encontrada' USING errcode = 'P0002';
    END IF;

    IF v_os.status <> 'concluida'::public.status_os THEN
      RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] A OS precisa estar concluída para gerar contas a receber.' USING errcode = '23514';
    END IF;

    IF v_os.cliente_id IS NULL THEN
      RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] A OS não possui cliente vinculado.' USING errcode = '23514';
    END IF;

    FOR v_parcela IN
      SELECT *
      FROM public.ordem_servico_parcelas p
      WHERE p.empresa_id = v_empresa
        AND p.ordem_servico_id = p_os_id
        AND p.status <> 'cancelada'::public.status_parcela
      ORDER BY p.numero_parcela
    LOOP
      PERFORM public.financeiro_conta_a_receber_from_os_parcela_create(v_parcela.id);
    END LOOP;

    RETURN QUERY
    SELECT c.*
    FROM public.contas_a_receber c
    JOIN public.ordem_servico_parcelas p ON p.id = c.origem_id
    WHERE c.empresa_id = v_empresa
      AND c.origem_tipo = 'OS_PARCELA'
      AND p.ordem_servico_id = p_os_id
    ORDER BY p.numero_parcela;
  END;
  $function$;
  $sql$;
END $$;

-- 3.3) PDV: estorno com lock por pedido
DO $$
BEGIN
  IF to_regprocedure('public.vendas_pdv_estornar(uuid,uuid)') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
  CREATE OR REPLACE FUNCTION public.vendas_pdv_estornar(p_pedido_id uuid, p_conta_corrente_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $function$
  DECLARE
    v_emp uuid := public.current_empresa_id();
    v_row public.vendas_pedidos%ROWTYPE;
    v_doc text;
    r record;
  BEGIN
    PERFORM public.require_permission_for_current_user('vendas', 'update');

    PERFORM pg_advisory_xact_lock(hashtextextended(p_pedido_id::text, 0));

    SELECT *
      INTO v_row
      FROM public.vendas_pedidos
     WHERE id = p_pedido_id
       AND empresa_id = v_emp
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pedido não encontrado';
    END IF;

    IF coalesce(v_row.canal, '') <> 'pdv' THEN
      RAISE EXCEPTION 'Estorno disponível apenas para pedidos do PDV';
    END IF;

    IF v_row.status <> 'concluido' THEN
      RAISE EXCEPTION 'Somente pedidos concluídos podem ser estornados';
    END IF;

    IF v_row.pdv_estornado_at IS NOT NULL THEN
      RETURN;
    END IF;

    v_doc := 'PDV-ESTORNO-' || v_row.numero::text;

    PERFORM public.financeiro_movimentacoes_upsert(
      jsonb_build_object(
        'conta_corrente_id', p_conta_corrente_id,
        'tipo_mov', 'saida',
        'valor', v_row.total_geral,
        'descricao', 'Estorno PDV #' || v_row.numero::text,
        'documento_ref', v_doc,
        'origem_tipo', 'venda_pdv_estorno',
        'origem_id', v_row.id,
        'categoria', 'Vendas',
        'observacoes', 'Estorno automático (PDV)'
      )
    );

    FOR r IN
      SELECT i.produto_id, i.quantidade
        FROM public.vendas_itens_pedido i
       WHERE i.empresa_id = v_emp
         AND i.pedido_id = v_row.id
    LOOP
      PERFORM public.suprimentos_registrar_movimento(
        r.produto_id,
        'entrada',
        r.quantidade,
        NULL,
        v_doc,
        'Estorno PDV (entrada de estoque)'
      );
    END LOOP;

    UPDATE public.vendas_pedidos
       SET status = 'cancelado',
           pdv_estornado_at = now(),
           pdv_estornado_by = auth.uid(),
           updated_at = now()
     WHERE id = v_row.id
       AND empresa_id = v_emp;
  END;
  $function$;
  $sql$;
END $$;

COMMIT;

