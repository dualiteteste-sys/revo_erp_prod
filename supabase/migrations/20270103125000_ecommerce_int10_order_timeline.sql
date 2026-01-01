/*
  INT-10: Timeline por pedido marketplace

  Objetivo:
  - Retornar timeline unificada (import/logs) para um vendas_pedido_id.
*/

BEGIN;

drop function if exists public.ecommerce_order_timeline(uuid);
create function public.ecommerce_order_timeline(p_vendas_pedido_id uuid)
returns table(
  occurred_at timestamptz,
  kind text,
  level text,
  message text,
  meta jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_external text := null;
  v_ecommerce uuid := null;
begin
  perform public.require_permission_for_current_user('ecommerce','view');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;
  if p_vendas_pedido_id is null then
    return;
  end if;

  select l.external_order_id, l.ecommerce_id
    into v_external, v_ecommerce
  from public.ecommerce_order_links l
  where l.empresa_id = v_empresa
    and l.vendas_pedido_id = p_vendas_pedido_id
  order by l.updated_at desc
  limit 1;

  return query
  with base as (
    select
      coalesce(l.imported_at, l.updated_at, l.created_at) as occurred_at,
      'import'::text as kind,
      'info'::text as level,
      format('Importado do marketplace (%s)', coalesce(v_external,'—')) as message,
      jsonb_build_object('provider', l.provider, 'external_order_id', l.external_order_id) as meta
    from public.ecommerce_order_links l
    where l.empresa_id = v_empresa
      and l.vendas_pedido_id = p_vendas_pedido_id
  ),
  logs as (
    select
      e.created_at as occurred_at,
      'log'::text as kind,
      e.level,
      coalesce(nullif(e.message,''), nullif(e.event,''), 'evento') as message,
      jsonb_build_object(
        'provider', e.provider,
        'event', e.event,
        'entity_type', e.entity_type,
        'entity_external_id', e.entity_external_id,
        'context', e.context
      ) as meta
    from public.ecommerce_logs e
    where e.empresa_id = v_empresa
      and (
        (e.entity_id is not null and e.entity_id = p_vendas_pedido_id)
        or (v_external is not null and e.entity_external_id = v_external)
      )
      and e.provider in ('meli','shopee')
  )
  select * from (
    select * from base
    union all
    select * from logs
  ) t
  order by occurred_at desc
  limit 200;
end;
$$;

revoke all on function public.ecommerce_order_timeline(uuid) from public;
grant execute on function public.ecommerce_order_timeline(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

