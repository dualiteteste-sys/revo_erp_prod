/*
  FIN-04 Centros de custo (quando ativo)
  - Introduz centro_de_custo_id nas entidades financeiras principais
  - Mantém compatibilidade com o campo legado (centro_custo text)
  - Valida centro_de_custo_id (mesma empresa + ativo) nas RPCs de upsert
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Colunas + FKs (idempotente)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.financeiro_centros_custos') is null then
    raise notice 'FIN-04: tabela public.financeiro_centros_custos não encontrada; pulando.';
    return;
  end if;

  if to_regclass('public.contas_a_receber') is not null then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='contas_a_receber' and column_name='centro_de_custo_id'
    ) then
      alter table public.contas_a_receber
        add column centro_de_custo_id uuid null references public.financeiro_centros_custos(id) on delete set null;
      create index if not exists idx_contas_a_receber_empresa_centro
        on public.contas_a_receber (empresa_id, centro_de_custo_id);
    end if;
  end if;

  if to_regclass('public.financeiro_contas_pagar') is not null then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='financeiro_contas_pagar' and column_name='centro_de_custo_id'
    ) then
      alter table public.financeiro_contas_pagar
        add column centro_de_custo_id uuid null references public.financeiro_centros_custos(id) on delete set null;
      create index if not exists idx_fin_cp_empresa_centro
        on public.financeiro_contas_pagar (empresa_id, centro_de_custo_id);
    end if;
  end if;

  if to_regclass('public.financeiro_movimentacoes') is not null then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='financeiro_movimentacoes' and column_name='centro_de_custo_id'
    ) then
      alter table public.financeiro_movimentacoes
        add column centro_de_custo_id uuid null references public.financeiro_centros_custos(id) on delete set null;
      create index if not exists idx_fin_mov_empresa_centro
        on public.financeiro_movimentacoes (empresa_id, centro_de_custo_id);
    end if;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) Helper de validação
-- -----------------------------------------------------------------------------
create or replace function public._fin04_assert_centro_de_custo(p_centro_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_ok boolean;
begin
  if p_centro_id is null then
    return;
  end if;
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  select true into v_ok
  from public.financeiro_centros_custos c
  where c.id = p_centro_id
    and c.empresa_id = v_empresa
    and coalesce(c.ativo, true) = true;

  if not coalesce(v_ok,false) then
    raise exception 'Centro de custo inválido/inativo' using errcode = '23503';
  end if;
end;
$$;

revoke all on function public._fin04_assert_centro_de_custo(uuid) from public;
grant execute on function public._fin04_assert_centro_de_custo(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) RPCs (upsert) com suporte a centro_de_custo_id
-- -----------------------------------------------------------------------------
create or replace function public.create_update_conta_a_receber(p_payload jsonb)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_centro uuid := nullif(p_payload->>'centro_de_custo_id','')::uuid;
  rec public.contas_a_receber;
begin
  if v_id is null then
    perform public.require_permission_for_current_user('contas_a_receber','create');
  else
    perform public.require_permission_for_current_user('contas_a_receber','update');
  end if;

  perform public._fin04_assert_centro_de_custo(v_centro);

  if v_id is null then
    insert into public.contas_a_receber (
      empresa_id, cliente_id, descricao, valor, data_vencimento, status, data_pagamento, valor_pago, observacoes, centro_de_custo_id
    ) values (
      public.current_empresa_id(),
      nullif(p_payload->>'cliente_id','')::uuid,
      p_payload->>'descricao',
      nullif(p_payload->>'valor','')::numeric,
      nullif(p_payload->>'data_vencimento','')::date,
      coalesce(p_payload->>'status','pendente')::public.status_conta_receber,
      nullif(p_payload->>'data_pagamento','')::date,
      nullif(p_payload->>'valor_pago','')::numeric,
      p_payload->>'observacoes',
      v_centro
    )
    returning * into rec;
  else
    update public.contas_a_receber set
      cliente_id      = nullif(p_payload->>'cliente_id','')::uuid,
      descricao       = p_payload->>'descricao',
      valor           = nullif(p_payload->>'valor','')::numeric,
      data_vencimento = nullif(p_payload->>'data_vencimento','')::date,
      status          = coalesce(p_payload->>'status','pendente')::public.status_conta_receber,
      data_pagamento  = nullif(p_payload->>'data_pagamento','')::date,
      valor_pago      = nullif(p_payload->>'valor_pago','')::numeric,
      observacoes     = p_payload->>'observacoes',
      centro_de_custo_id = case
        when p_payload ? 'centro_de_custo_id' then v_centro
        else centro_de_custo_id
      end
    where id = v_id and empresa_id = public.current_empresa_id()
    returning * into rec;
  end if;

  return rec;
end;
$$;

revoke all on function public.create_update_conta_a_receber(jsonb) from public;
grant execute on function public.create_update_conta_a_receber(jsonb) to authenticated, service_role;

-- Contas a pagar: mantém compatibilidade com centro_custo text e adiciona centro_de_custo_id
create or replace function public.financeiro_contas_pagar_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_centro uuid := nullif(p_payload->>'centro_de_custo_id','')::uuid;
  v_status text := coalesce(nullif(p_payload->>'status',''), 'aberta');
  rec public.financeiro_contas_pagar;
begin
  if v_id is null then
    perform public.require_permission_for_current_user('contas_a_pagar','create');
  else
    perform public.require_permission_for_current_user('contas_a_pagar','update');
  end if;

  perform public._fin04_assert_centro_de_custo(v_centro);

  if v_status not in ('aberta','parcial','paga','cancelada') then
    v_status := 'aberta';
  end if;

  if v_id is null then
    insert into public.financeiro_contas_pagar (
      empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento, data_pagamento,
      valor_total, valor_pago, multa, juros, desconto, forma_pagamento, centro_custo, categoria, status, observacoes,
      centro_de_custo_id
    ) values (
      v_empresa,
      nullif(p_payload->>'fornecedor_id','')::uuid,
      nullif(p_payload->>'documento_ref',''),
      nullif(p_payload->>'descricao',''),
      nullif(p_payload->>'data_emissao','')::date,
      nullif(p_payload->>'data_vencimento','')::date,
      nullif(p_payload->>'data_pagamento','')::date,
      coalesce(nullif(p_payload->>'valor_total','')::numeric, 0),
      coalesce(nullif(p_payload->>'valor_pago','')::numeric, 0),
      coalesce(nullif(p_payload->>'multa','')::numeric, 0),
      coalesce(nullif(p_payload->>'juros','')::numeric, 0),
      coalesce(nullif(p_payload->>'desconto','')::numeric, 0),
      nullif(p_payload->>'forma_pagamento',''),
      nullif(p_payload->>'centro_custo',''),
      nullif(p_payload->>'categoria',''),
      v_status,
      nullif(p_payload->>'observacoes',''),
      v_centro
    )
    returning * into rec;
  else
    update public.financeiro_contas_pagar cp set
      fornecedor_id      = case when p_payload ? 'fornecedor_id' then nullif(p_payload->>'fornecedor_id','')::uuid else cp.fornecedor_id end,
      documento_ref      = case when p_payload ? 'documento_ref' then nullif(p_payload->>'documento_ref','') else cp.documento_ref end,
      descricao          = case when p_payload ? 'descricao' then nullif(p_payload->>'descricao','') else cp.descricao end,
      data_emissao       = case when p_payload ? 'data_emissao' then nullif(p_payload->>'data_emissao','')::date else cp.data_emissao end,
      data_vencimento    = case when p_payload ? 'data_vencimento' then nullif(p_payload->>'data_vencimento','')::date else cp.data_vencimento end,
      -- data_pagamento/valor_pago são mantidos pelo fluxo de baixa; mas aceitamos quando explicitamente enviado
      data_pagamento     = case when p_payload ? 'data_pagamento' then nullif(p_payload->>'data_pagamento','')::date else cp.data_pagamento end,
      valor_total        = case when p_payload ? 'valor_total' then coalesce(nullif(p_payload->>'valor_total','')::numeric, 0) else cp.valor_total end,
      valor_pago         = case when p_payload ? 'valor_pago' then coalesce(nullif(p_payload->>'valor_pago','')::numeric, 0) else cp.valor_pago end,
      multa              = case when p_payload ? 'multa' then coalesce(nullif(p_payload->>'multa','')::numeric, 0) else cp.multa end,
      juros              = case when p_payload ? 'juros' then coalesce(nullif(p_payload->>'juros','')::numeric, 0) else cp.juros end,
      desconto           = case when p_payload ? 'desconto' then coalesce(nullif(p_payload->>'desconto','')::numeric, 0) else cp.desconto end,
      forma_pagamento    = case when p_payload ? 'forma_pagamento' then nullif(p_payload->>'forma_pagamento','') else cp.forma_pagamento end,
      centro_custo       = case when p_payload ? 'centro_custo' then nullif(p_payload->>'centro_custo','') else cp.centro_custo end,
      categoria          = case when p_payload ? 'categoria' then nullif(p_payload->>'categoria','') else cp.categoria end,
      status             = case when p_payload ? 'status' then v_status else cp.status end,
      observacoes        = case when p_payload ? 'observacoes' then nullif(p_payload->>'observacoes','') else cp.observacoes end,
      centro_de_custo_id = case when p_payload ? 'centro_de_custo_id' then v_centro else cp.centro_de_custo_id end
    where cp.id = v_id and cp.empresa_id = v_empresa
    returning cp.* into rec;
  end if;

  return to_jsonb(rec)
    || jsonb_build_object('saldo', (rec.valor_total + rec.multa + rec.juros - rec.desconto) - rec.valor_pago);
end;
$$;

revoke all on function public.financeiro_contas_pagar_upsert(jsonb) from public;
grant execute on function public.financeiro_contas_pagar_upsert(jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Relatório simples por Centro de Custo (para "quando ativo")
-- -----------------------------------------------------------------------------
drop function if exists public.financeiro_relatorio_por_centro_custo(date, date);
create function public.financeiro_relatorio_por_centro_custo(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  centro_id uuid,
  centro_nome text,
  entradas numeric,
  saidas numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_start date := coalesce(p_start_date, (date_trunc('month', current_date) - interval '5 months')::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
begin
  perform public.require_permission_for_current_user('relatorios_financeiro','view');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  return query
  with receber as (
    select
      c.centro_de_custo_id,
      sum(coalesce(c.valor_pago, c.valor)) as entradas
    from public.contas_a_receber c
    where c.empresa_id = v_empresa
      and c.status = 'pago'::public.status_conta_receber
      and c.data_pagamento between v_start and v_end
    group by 1
  ),
  pagar as (
    select
      p.centro_de_custo_id,
      sum(coalesce(p.valor_pago, 0)) as saidas
    from public.financeiro_contas_pagar p
    where p.empresa_id = v_empresa
      and p.status = 'paga'
      and p.data_pagamento between v_start and v_end
    group by 1
  ),
  merged as (
    select
      coalesce(r.centro_de_custo_id, g.centro_de_custo_id) as centro_id,
      coalesce(r.entradas, 0) as entradas,
      coalesce(g.saidas, 0) as saidas
    from receber r
    full join pagar g
      on r.centro_de_custo_id is not distinct from g.centro_de_custo_id
  )
  select
    m.centro_id,
    case
      when m.centro_id is null then 'Sem centro'
      else coalesce(cc.nome, 'Centro')
    end as centro_nome,
    m.entradas,
    m.saidas
  from merged m
  left join public.financeiro_centros_custos cc
    on cc.id = m.centro_id
   and cc.empresa_id = v_empresa
  order by (m.entradas + m.saidas) desc;
end;
$$;

revoke all on function public.financeiro_relatorio_por_centro_custo(date, date) from public;
grant execute on function public.financeiro_relatorio_por_centro_custo(date, date) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;
