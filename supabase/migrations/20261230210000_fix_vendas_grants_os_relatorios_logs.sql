/*
  Fixes for DEV console sweep:
  - 403 on public.vendas_pedidos (missing grants for authenticated)
  - 400 on public.os_relatorios_resumo (nested aggregates in __unsafe)
  - 403 on public.list_events_for_current_user (audit schema access)
*/

begin;

-- ============================================================
-- 1) Vendas: garantir grants (PostgREST direct table access)
-- ============================================================

grant usage, select on sequence public.vendas_pedidos_numero_seq to authenticated;

grant select, insert, update, delete on table public.vendas_pedidos to authenticated;
grant select, insert, update, delete on table public.vendas_itens_pedido to authenticated;

-- ============================================================
-- 2) Serviços: corrigir nested aggregates no __unsafe
-- ============================================================

create or replace function public.os_relatorios_resumo__unsafe(
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_start date := coalesce(p_start_date, (date_trunc('month', current_date) - interval '5 months')::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
  v_kpis jsonb;
  v_status jsonb;
  v_top_clientes jsonb;
  v_faturamento jsonb;
begin
  if v_empresa is null then
    raise exception '[OS][RELATORIOS] empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  with base as (
    select
      os.id,
      os.status,
      os.cliente_id,
      os.total_geral,
      os.custo_real,
      coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) as data_ref
    from public.ordem_servicos os
    where os.empresa_id = v_empresa
      and coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) between v_start and v_end
  ),
  receber as (
    select
      sum(coalesce(c.valor_pago, c.valor)) filter (where c.status = 'pago'::public.status_conta_receber and c.data_pagamento between v_start and v_end) as recebido_periodo,
      sum(c.valor) filter (where c.status in ('pendente'::public.status_conta_receber, 'vencido'::public.status_conta_receber) and c.data_vencimento between v_start and v_end) as a_receber_periodo
    from public.contas_a_receber c
    where c.empresa_id = v_empresa
      and c.origem_tipo = 'OS'
  )
  select jsonb_build_object(
    'total_os', count(*),
    'total_orcamento', count(*) filter (where status = 'orcamento'::public.status_os),
    'total_aberta', count(*) filter (where status = 'aberta'::public.status_os),
    'total_concluida', count(*) filter (where status = 'concluida'::public.status_os),
    'total_cancelada', count(*) filter (where status = 'cancelada'::public.status_os),
    'faturamento', coalesce(sum(total_geral) filter (where status = 'concluida'::public.status_os), 0),
    'custo_real', coalesce(sum(custo_real) filter (where status = 'concluida'::public.status_os), 0),
    'margem', coalesce(sum(total_geral - custo_real) filter (where status = 'concluida'::public.status_os), 0),
    'recebido', coalesce((select recebido_periodo from receber), 0),
    'a_receber', coalesce((select a_receber_periodo from receber), 0)
  )
  into v_kpis
  from base;

  with base as (
    select
      os.status,
      os.total_geral,
      os.custo_real,
      coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) as data_ref
    from public.ordem_servicos os
    where os.empresa_id = v_empresa
      and coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) between v_start and v_end
  ),
  agg as (
    select
      status::text as status,
      count(*) as qtd,
      coalesce(sum(total_geral), 0) as total,
      coalesce(sum(custo_real), 0) as custo
    from base
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'status', status,
        'qtd', qtd,
        'total', total,
        'custo', custo
      )
      order by status
    ),
    '[]'::jsonb
  )
  into v_status
  from agg;

  with base as (
    select
      os.cliente_id,
      os.total_geral,
      os.custo_real,
      coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) as data_ref
    from public.ordem_servicos os
    where os.empresa_id = v_empresa
      and coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) between v_start and v_end
  ),
  agg as (
    select
      b.cliente_id,
      p.nome as cliente_nome,
      count(*) as qtd,
      coalesce(sum(b.total_geral) filter (where b.total_geral is not null), 0) as faturamento,
      coalesce(sum(b.custo_real) filter (where b.custo_real is not null), 0) as custo
    from base b
    left join public.pessoas p
      on p.id = b.cliente_id
     and p.empresa_id = v_empresa
    group by b.cliente_id, p.nome
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cliente_id', cliente_id::text,
        'cliente_nome', cliente_nome,
        'qtd', qtd,
        'faturamento', faturamento,
        'custo', custo
      )
      order by faturamento desc
    ),
    '[]'::jsonb
  )
  into v_top_clientes
  from (
    select *
    from agg
    order by faturamento desc
    limit 10
  ) t;

  with months as (
    select generate_series(
      date_trunc('month', v_start)::date,
      date_trunc('month', v_end)::date,
      interval '1 month'
    )::date as mes
  ),
  fat as (
    select
      date_trunc('month', os.data_conclusao)::date as mes,
      sum(os.total_geral) as faturamento,
      sum(os.custo_real) as custo_real
    from public.ordem_servicos os
    where os.empresa_id = v_empresa
      and os.status = 'concluida'::public.status_os
      and os.data_conclusao between v_start and v_end
    group by 1
  ),
  rec as (
    select
      date_trunc('month', c.data_pagamento)::date as mes,
      sum(coalesce(c.valor_pago, c.valor)) as recebido
    from public.contas_a_receber c
    where c.empresa_id = v_empresa
      and c.origem_tipo = 'OS'
      and c.status = 'pago'::public.status_conta_receber
      and c.data_pagamento between v_start and v_end
    group by 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'mes', to_char(m.mes, 'YYYY-MM'),
      'faturamento', coalesce(fat.faturamento, 0),
      'custo_real', coalesce(fat.custo_real, 0),
      'margem', coalesce(fat.faturamento, 0) - coalesce(fat.custo_real, 0),
      'recebido', coalesce(rec.recebido, 0)
    )
    order by m.mes
  )
  into v_faturamento
  from months m
  left join fat on fat.mes = m.mes
  left join rec on rec.mes = m.mes;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', v_start::text, 'fim', v_end::text),
    'kpis', coalesce(v_kpis, '{}'::jsonb),
    'por_status', coalesce(v_status, '[]'::jsonb),
    'top_clientes', coalesce(v_top_clientes, '[]'::jsonb),
    'faturamento_mensal', coalesce(v_faturamento, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.os_relatorios_resumo__unsafe(date, date) from public;
grant execute on function public.os_relatorios_resumo__unsafe(date, date) to authenticated, service_role;

-- ============================================================
-- 3) Logs: wrapper seguro sem depender de privileges no schema audit
-- ============================================================

drop function if exists public.list_events_for_current_user(
  timestamp with time zone,
  timestamp with time zone,
  text[],
  text[],
  text[],
  text,
  timestamp with time zone,
  integer
);

create function public.list_events_for_current_user(
  p_from timestamptz default (now() - interval '30 days'),
  p_to timestamptz default now(),
  p_source text[] default null,
  p_table text[] default null,
  p_op text[] default null,
  p_q text default null,
  p_after timestamptz default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  empresa_id uuid,
  occurred_at timestamptz,
  source text,
  table_name text,
  op text,
  actor_id uuid,
  actor_email text,
  pk jsonb,
  row_old jsonb,
  row_new jsonb,
  diff jsonb,
  meta jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, audit
as $$
begin
  perform public.require_permission_for_current_user('logs','view');

  return query
  select
    e.id,
    e.empresa_id,
    e.occurred_at,
    e.source,
    e.table_name,
    e.op::text,
    e.actor_id,
    e.actor_email,
    e.pk,
    e.row_old,
    e.row_new,
    e.diff,
    e.meta
  from audit.list_events_for_current_user(
    p_from, p_to, p_source, p_table, p_op, p_q, p_after, p_limit
  ) e;
end;
$$;

revoke all on function public.list_events_for_current_user(
  timestamptz,
  timestamptz,
  text[],
  text[],
  text[],
  text,
  timestamptz,
  integer
) from public;
grant execute on function public.list_events_for_current_user(
  timestamptz,
  timestamptz,
  text[],
  text[],
  text[],
  text,
  timestamptz,
  integer
) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

