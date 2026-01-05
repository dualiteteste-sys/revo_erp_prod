/*
  VEN-STA-03: Expedição com SLA e relatórios (pendências/atrasos)

  O que adiciona
  - RPC de stats (cards) e RPC de listagem com campos calculados:
    - SLA deadline, horas em aberto, atraso e último evento.

  Observações
  - Não altera schema de tabelas (somente SQL de consulta).
  - Usa RBAC: `require_permission_for_current_user('vendas','view')`.
*/

begin;

drop function if exists public.vendas_expedicoes_sla_stats(int);
create or replace function public.vendas_expedicoes_sla_stats(
  p_sla_hours int default 48
)
returns table(
  abertas int,
  overdue int,
  enviado int,
  entregue int,
  cancelado int
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_sla int := greatest(coalesce(p_sla_hours, 48), 1);
begin
  perform public.require_permission_for_current_user('vendas','view');

  return query
  with base as (
    select
      e.status,
      (now() > (e.created_at + make_interval(hours => v_sla))) as is_overdue
    from public.vendas_expedicoes e
    where e.empresa_id = v_emp
  )
  select
    count(*) filter (where status not in ('entregue','cancelado'))::int as abertas,
    count(*) filter (where status not in ('entregue','cancelado') and is_overdue)::int as overdue,
    count(*) filter (where status = 'enviado')::int as enviado,
    count(*) filter (where status = 'entregue')::int as entregue,
    count(*) filter (where status = 'cancelado')::int as cancelado
  from base;
end;
$$;

revoke all on function public.vendas_expedicoes_sla_stats(int) from public, anon;
grant execute on function public.vendas_expedicoes_sla_stats(int) to authenticated, service_role;

drop function if exists public.vendas_expedicoes_sla_list(int, boolean, text[], int, int);
create or replace function public.vendas_expedicoes_sla_list(
  p_sla_hours int default 48,
  p_only_overdue boolean default false,
  p_status text[] default null,
  p_limit int default 200,
  p_offset int default 0
)
returns table(
  expedicao_id uuid,
  pedido_id uuid,
  pedido_numero int,
  cliente_nome text,
  status text,
  tracking_code text,
  data_envio date,
  data_entrega date,
  created_at timestamptz,
  updated_at timestamptz,
  last_event_at timestamptz,
  events_count int,
  sla_deadline_at timestamptz,
  age_hours int,
  overdue boolean,
  hours_left int
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_sla int := greatest(coalesce(p_sla_hours, 48), 1);
begin
  perform public.require_permission_for_current_user('vendas','view');

  return query
  with base as (
    select
      e.id as expedicao_id,
      e.pedido_id,
      p.numero as pedido_numero,
      c.nome as cliente_nome,
      e.status,
      e.tracking_code,
      e.data_envio,
      e.data_entrega,
      e.created_at,
      e.updated_at,
      (select max(ev.created_at) from public.vendas_expedicao_eventos ev where ev.empresa_id = v_emp and ev.expedicao_id = e.id) as last_event_at,
      (select count(*)::int from public.vendas_expedicao_eventos ev where ev.empresa_id = v_emp and ev.expedicao_id = e.id) as events_count,
      (e.created_at + make_interval(hours => v_sla)) as sla_deadline_at,
      floor(extract(epoch from (now() - e.created_at))/3600)::int as age_hours,
      (now() > (e.created_at + make_interval(hours => v_sla))) as overdue
    from public.vendas_expedicoes e
    join public.vendas_pedidos p
      on p.id = e.pedido_id and p.empresa_id = v_emp
    left join public.pessoas c
      on c.id = p.cliente_id and c.empresa_id = v_emp
    where e.empresa_id = v_emp
      and (
        p_status is null
        or array_length(p_status, 1) is null
        or e.status = any(p_status)
      )
  )
  select
    b.expedicao_id,
    b.pedido_id,
    b.pedido_numero,
    b.cliente_nome,
    b.status,
    b.tracking_code,
    b.data_envio,
    b.data_entrega,
    b.created_at,
    b.updated_at,
    b.last_event_at,
    coalesce(b.events_count, 0) as events_count,
    b.sla_deadline_at,
    b.age_hours,
    (b.overdue and b.status not in ('entregue','cancelado')) as overdue,
    greatest(0, floor(extract(epoch from (b.sla_deadline_at - now()))/3600)::int) as hours_left
  from base b
  where (
    not coalesce(p_only_overdue, false)
    or (b.overdue and b.status not in ('entregue','cancelado'))
  )
  order by
    (case when (b.overdue and b.status not in ('entregue','cancelado')) then 0 else 1 end),
    coalesce(b.last_event_at, b.updated_at) desc
  limit greatest(coalesce(p_limit, 200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.vendas_expedicoes_sla_list(int, boolean, text[], int, int) from public, anon;
grant execute on function public.vendas_expedicoes_sla_list(int, boolean, text[], int, int) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

