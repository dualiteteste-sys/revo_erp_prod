/*
  Vendas (MVP) — Devolução transacional + idempotência mínima

  Objetivos:
  - Evitar double-submit no frontend (idempotency_key)
  - Consolidar side-effects (itens + estoque + financeiro) em uma única RPC
  - Manter RLS ativo (row_security = on) e enforcement de permissões

  Idempotente: sim (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP/CREATE FUNCTION).
*/

-- 1) Coluna + índice de idempotência (empresa_id + idempotency_key)
alter table if exists public.vendas_devolucoes
  add column if not exists idempotency_key text;

create unique index if not exists idx_vendas_devolucoes_empresa_idempotency_key
  on public.vendas_devolucoes(empresa_id, idempotency_key)
  where idempotency_key is not null;

-- 2) RPC única (transacional) para criar devolução + efeitos colaterais
drop function if exists public.vendas_devolucao_create_with_side_effects(uuid, jsonb, uuid, text, text);
create function public.vendas_devolucao_create_with_side_effects(
  p_pedido_id uuid,
  p_itens jsonb,
  p_conta_corrente_id uuid,
  p_motivo text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_idemp text := nullif(btrim(coalesce(p_idempotency_key,'')), '');
  v_existing uuid;
  v_devolucao_id uuid;
  v_valor_total numeric := 0;
  v_item jsonb;
  v_prod uuid;
  v_qtd numeric;
  v_vu numeric;
  v_doc text;
begin
  perform public.require_permission_for_current_user('vendas','update');

  if p_pedido_id is null then
    raise exception 'pedido_id é obrigatório.' using errcode='22023';
  end if;
  if p_conta_corrente_id is null then
    raise exception 'conta_corrente_id é obrigatório.' using errcode='22023';
  end if;

  -- Idempotência: retorna o mesmo ID se já existir
  if v_idemp is not null then
    select d.id
      into v_existing
      from public.vendas_devolucoes d
     where d.empresa_id = v_empresa
       and d.idempotency_key = v_idemp
     limit 1;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens inválidos.' using errcode='22023';
  end if;

  -- Pré-validação + cálculo do total
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_prod := nullif(v_item->>'produto_id','')::uuid;
    v_qtd := coalesce(nullif(v_item->>'quantidade','')::numeric, 0);
    v_vu := coalesce(nullif(v_item->>'valor_unitario','')::numeric, 0);

    if v_prod is null then
      raise exception 'produto_id é obrigatório.' using errcode='22023';
    end if;
    if v_qtd <= 0 then
      raise exception 'quantidade inválida.' using errcode='22023';
    end if;
    if v_vu < 0 then
      raise exception 'valor_unitario inválido.' using errcode='22023';
    end if;

    v_valor_total := v_valor_total + (v_qtd * v_vu);
  end loop;

  begin
    insert into public.vendas_devolucoes(
      id,
      empresa_id,
      pedido_id,
      data_devolucao,
      motivo,
      valor_total,
      status,
      idempotency_key
    )
    values (
      gen_random_uuid(),
      v_empresa,
      p_pedido_id,
      current_date,
      p_motivo,
      v_valor_total,
      'registrada',
      v_idemp
    )
    returning id into v_devolucao_id;
  exception when unique_violation then
    if v_idemp is not null then
      select d.id
        into v_existing
        from public.vendas_devolucoes d
       where d.empresa_id = v_empresa
         and d.idempotency_key = v_idemp
       limit 1;
      if v_existing is not null then
        return v_existing;
      end if;
    end if;
    raise;
  end;

  v_doc := 'DEVOL-' || v_devolucao_id::text;

  -- Itens + estoque (entrada)
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_prod := nullif(v_item->>'produto_id','')::uuid;
    v_qtd := coalesce(nullif(v_item->>'quantidade','')::numeric, 0);
    v_vu := coalesce(nullif(v_item->>'valor_unitario','')::numeric, 0);

    insert into public.vendas_devolucao_itens(
      id,
      empresa_id,
      devolucao_id,
      produto_id,
      quantidade,
      valor_unitario
    )
    values (
      gen_random_uuid(),
      v_empresa,
      v_devolucao_id,
      v_prod,
      v_qtd,
      v_vu
    );

    perform public.suprimentos_registrar_movimento(
      v_prod,
      'entrada',
      v_qtd,
      null,
      v_doc,
      coalesce(nullif(p_motivo,''), 'Devolução de venda')
    );
  end loop;

  -- Financeiro (saída)
  perform public.financeiro_movimentacoes_upsert(
    jsonb_build_object(
      'conta_corrente_id', p_conta_corrente_id,
      'tipo_mov', 'saida',
      'valor', v_valor_total,
      'descricao', 'Devolução de venda (' || v_devolucao_id::text || ')',
      'documento_ref', v_doc,
      'origem_tipo', 'venda_devolucao',
      'origem_id', v_devolucao_id,
      'categoria', 'Devoluções',
      'observacoes', p_motivo
    )
  );

  update public.vendas_devolucoes
     set status = 'processada',
         updated_at = now()
   where empresa_id = v_empresa
     and id = v_devolucao_id;

  return v_devolucao_id;
end;
$$;

revoke all on function public.vendas_devolucao_create_with_side_effects(uuid, jsonb, uuid, text, text) from public, anon;
grant execute on function public.vendas_devolucao_create_with_side_effects(uuid, jsonb, uuid, text, text) to authenticated, service_role;
