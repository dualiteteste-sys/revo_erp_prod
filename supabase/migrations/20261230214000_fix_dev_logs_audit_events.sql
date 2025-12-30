/*
  Developer -> Logs
  - Normalize audit event schema to match the frontend expectations.
  - Provide `audit.events` (view) with `occurred_at` and other fields.
  - Implement `audit.list_events_for_current_user` with filtering + pagination.
*/

begin;

create schema if not exists audit;

-- `audit.events` existed historically as a stub table (baseline). Convert it to a view.
do $$
begin
  if to_regclass('audit.events') is null then
    return;
  end if;

  -- If it's a plain table, keep it as a legacy snapshot and replace with a view.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'audit'
      and c.relname = 'events'
      and c.relkind = 'r'
  ) then
    if to_regclass('audit.events__legacy_table') is not null then
      execute 'drop table audit.events__legacy_table cascade';
    end if;
    execute 'alter table audit.events rename to events__legacy_table';
  end if;

  -- If it's a materialized view, drop and recreate as a standard view.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'audit'
      and c.relname = 'events'
      and c.relkind = 'm'
  ) then
    execute 'drop materialized view audit.events';
  end if;
end;
$$;

-- A stable rowtype for the frontend (src/features/dev-logs/types.ts)
create or replace view audit.events as
select
  l.id,
  l.empresa_id,
  l.changed_at as occurred_at,
  'db'::text as source,
  l.table_name,
  l.operation as op,
  l.changed_by as actor_id,
  null::text as actor_email,
  case
    when l.record_id is null then null::jsonb
    else jsonb_build_object('id', l.record_id::text)
  end as pk,
  l.old_data as row_old,
  l.new_data as row_new,
  null::jsonb as diff,
  jsonb_build_object(
    'record_id', l.record_id,
    'table_name', l.table_name
  ) as meta
from public.audit_logs l;

drop function if exists audit.list_events_for_current_user(
  timestamptz,
  timestamptz,
  text[],
  text[],
  text[],
  text,
  timestamptz,
  int
);

drop function if exists audit.list_events_for_current_user(
  timestamptz,
  timestamptz,
  text[],
  text[],
  text[],
  text,
  timestamptz,
  integer
);

create or replace function audit.list_events_for_current_user(
  p_from timestamptz default (now() - interval '30 days'),
  p_to timestamptz default now(),
  p_source text[] default null,
  p_table text[] default null,
  p_op text[] default null,
  p_q text default null,
  p_after timestamptz default null,
  p_limit integer default 50
)
returns setof audit.events
language sql
stable
security definer
set search_path = pg_catalog, public, audit
as $$
  select e.*
  from audit.events e
  where e.empresa_id = public.current_empresa_id()
    and e.occurred_at between coalesce(p_from, now() - interval '30 days') and coalesce(p_to, now())
    and (p_after is null or e.occurred_at < p_after)
    and (p_source is null or e.source = any(p_source))
    and (p_table is null or e.table_name = any(p_table))
    and (p_op is null or e.op = any(p_op))
    and (
      p_q is null
      or e.table_name ilike '%' || p_q || '%'
      or e.op ilike '%' || p_q || '%'
      or e.pk::text ilike '%' || p_q || '%'
      or e.row_new::text ilike '%' || p_q || '%'
      or e.row_old::text ilike '%' || p_q || '%'
    )
  order by e.occurred_at desc
  limit greatest(p_limit, 1);
$$;

revoke all on function audit.list_events_for_current_user(
  timestamptz,
  timestamptz,
  text[],
  text[],
  text[],
  text,
  timestamptz,
  integer
) from public;
grant execute on function audit.list_events_for_current_user(
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
