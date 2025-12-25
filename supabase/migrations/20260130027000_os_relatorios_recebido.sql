/*
  Serviços (OS): Relatórios - Faturado x Recebido (MVP)

  - Estende os_relatorios_resumo com:
    - recebido (pagamentos no período via contas_a_receber origem OS)
    - a_receber (pendente/vencido no período via contas_a_receber origem OS)
    - faturamento_mensal inclui recebido
*/

create or replace function public.os_relatorios_resumo(
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
  )
  select jsonb_agg(
    jsonb_build_object(
      'status', status::text,
      'qtd', count(*),
      'total', coalesce(sum(total_geral), 0),
      'custo', coalesce(sum(custo_real), 0)
    )
    order by status::text
  )
  into v_status
  from base
  group by status;

  with base as (
    select
      os.cliente_id,
      os.total_geral,
      os.custo_real,
      coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) as data_ref
    from public.ordem_servicos os
    where os.empresa_id = v_empresa
      and coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) between v_start and v_end
  )
  select jsonb_agg(
    jsonb_build_object(
      'cliente_id', cliente_id::text,
      'cliente_nome', p.nome,
      'qtd', count(*),
      'faturamento', coalesce(sum(total_geral) filter (where total_geral is not null), 0),
      'custo', coalesce(sum(custo_real) filter (where custo_real is not null), 0)
    )
    order by coalesce(sum(total_geral), 0) desc
  )
  into v_top_clientes
  from base b
  left join public.pessoas p
    on p.id = b.cliente_id
   and p.empresa_id = v_empresa
  group by b.cliente_id, p.nome
  limit 10;

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

revoke all on function public.os_relatorios_resumo(date, date) from public;
grant execute on function public.os_relatorios_resumo(date, date) to authenticated, service_role;

