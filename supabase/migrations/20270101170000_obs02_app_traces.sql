/*
  OBS-02: Tracing por ação crítica (SRE-lite)
  - Persistir traces (ação + duração + status + request_id) para auditoria e debug.
  - Expor no Developer -> Logs via audit.events.
*/

begin;

create extension if not exists pgcrypto;

create table if not exists public.app_traces (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  action text not null,
  status text not null check (status in ('ok','error')),
  source text not null default 'ui',
  duration_ms integer null,
  request_id text null,
  action_id text null,
  error_message text null,
  context jsonb not null default '{}'::jsonb,
  actor_id uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.app_traces enable row level security;

drop policy if exists app_traces_select on public.app_traces;
create policy app_traces_select
  on public.app_traces
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists app_traces_insert_deny on public.app_traces;
create policy app_traces_insert_deny
  on public.app_traces
  for insert
  to authenticated
  with check (false);

drop policy if exists app_traces_update_deny on public.app_traces;
create policy app_traces_update_deny
  on public.app_traces
  for update
  to authenticated
  using (false);

drop policy if exists app_traces_delete_deny on public.app_traces;
create policy app_traces_delete_deny
  on public.app_traces
  for delete
  to authenticated
  using (false);

create index if not exists idx_app_traces_empresa_created_at on public.app_traces(empresa_id, created_at desc);
create index if not exists idx_app_traces_empresa_action_created_at on public.app_traces(empresa_id, action, created_at desc);
create index if not exists idx_app_traces_empresa_status_created_at on public.app_traces(empresa_id, status, created_at desc);

drop function if exists public.log_app_trace(text, text, integer, jsonb, text, text, text, text);
create function public.log_app_trace(
  p_action text,
  p_status text default 'ok',
  p_duration_ms integer default null,
  p_context jsonb default null,
  p_error text default null,
  p_request_id text default null,
  p_action_id text default null,
  p_source text default 'ui'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_action text := coalesce(nullif(btrim(p_action),''), 'unknown_action');
  v_status text := lower(coalesce(p_status, 'ok'));
  v_source text := coalesce(nullif(btrim(p_source),''), 'ui');
  v_err text := nullif(btrim(coalesce(p_error,'')), '');
  v_id uuid;
begin
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  if v_status not in ('ok','error') then
    v_status := 'ok';
  end if;

  if length(v_action) > 120 then v_action := left(v_action, 120); end if;
  if length(v_source) > 40 then v_source := left(v_source, 40); end if;
  if v_err is not null and length(v_err) > 2000 then v_err := left(v_err, 2000); end if;

  insert into public.app_traces (
    empresa_id, action, status, source, duration_ms, request_id, action_id, error_message, context, actor_id
  ) values (
    v_empresa, v_action, v_status, v_source, p_duration_ms, nullif(p_request_id,''), nullif(p_action_id,''), v_err,
    coalesce(p_context, '{}'::jsonb), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_app_trace(text, text, integer, jsonb, text, text, text, text) from public;
grant execute on function public.log_app_trace(text, text, integer, jsonb, text, text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Expor traces no Developer -> Logs via audit.events
-- -----------------------------------------------------------------------------
create schema if not exists audit;

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
from public.audit_logs l

union all

select
  a.id,
  a.empresa_id,
  a.created_at as occurred_at,
  'app'::text as source,
  'app_logs'::text as table_name,
  'INSERT'::text as op,
  a.actor_id as actor_id,
  null::text as actor_email,
  jsonb_build_object('id', a.id::text) as pk,
  null::jsonb as row_old,
  jsonb_build_object(
    'level', a.level,
    'event', a.event,
    'message', a.message,
    'context', a.context
  ) as row_new,
  null::jsonb as diff,
  jsonb_build_object(
    'level', a.level,
    'event', a.event,
    'source', a.source
  ) as meta
from public.app_logs a

union all

select
  t.id,
  t.empresa_id,
  t.created_at as occurred_at,
  'app'::text as source,
  'app_traces'::text as table_name,
  'INSERT'::text as op,
  t.actor_id as actor_id,
  null::text as actor_email,
  jsonb_build_object('id', t.id::text) as pk,
  null::jsonb as row_old,
  jsonb_build_object(
    'action', t.action,
    'status', t.status,
    'duration_ms', t.duration_ms,
    'request_id', t.request_id,
    'action_id', t.action_id,
    'error_message', t.error_message,
    'context', t.context
  ) as row_new,
  null::jsonb as diff,
  jsonb_build_object(
    'action', t.action,
    'status', t.status,
    'source', t.source
  ) as meta
from public.app_traces t;

commit;

