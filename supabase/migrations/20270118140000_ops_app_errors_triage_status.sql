/*
  P5.2: Triagem "Erros no Sistema"
  - Status: novo → investigando → corrigido (ou ignorado)
  - Filtros por status e SLA (beta)
  - Mantém compat com `resolved` para evitar regressão.
*/

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_app_error_status') then
    create type public.ops_app_error_status as enum ('novo', 'investigando', 'corrigido', 'ignorado');
  end if;
end $$;

alter table public.ops_app_errors
  add column if not exists status public.ops_app_error_status not null default 'novo',
  add column if not exists triage_note text null,
  add column if not exists triage_updated_at timestamptz null,
  add column if not exists triage_updated_by uuid null;

-- Backfill (best-effort)
update public.ops_app_errors
   set status = case
     when resolved then 'corrigido'::public.ops_app_error_status
     else 'novo'::public.ops_app_error_status
   end;

update public.ops_app_errors
   set triage_updated_at = coalesce(triage_updated_at, created_at)
 where triage_updated_at is null;

-- -----------------------------------------------------------------------------
-- RPC: list/count (agora com filtro por status)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_app_errors_list(int,int,boolean,text,text,text[]);
create or replace function public.ops_app_errors_list(
  p_limit int default 50,
  p_offset int default 0,
  p_only_open boolean default true,
  p_q text default null,
  p_source text default null,
  p_statuses text[] default null
)
returns table (
  id uuid,
  created_at timestamptz,
  empresa_id uuid,
  user_id uuid,
  source text,
  route text,
  last_action text,
  message text,
  request_id text,
  url text,
  method text,
  http_status int,
  code text,
  response_text text,
  fingerprint text,
  status public.ops_app_error_status,
  resolved boolean,
  resolved_at timestamptz,
  resolved_by uuid,
  triage_note text,
  triage_updated_at timestamptz,
  triage_updated_by uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  perform public.require_permission_for_current_user('ops','view');

  return query
  select
    e.id,
    e.created_at,
    e.empresa_id,
    e.user_id,
    e.source,
    e.route,
    e.last_action,
    e.message,
    e.request_id,
    e.url,
    e.method,
    e.http_status,
    e.code,
    e.response_text,
    e.fingerprint,
    e.status,
    e.resolved,
    e.resolved_at,
    e.resolved_by,
    e.triage_note,
    e.triage_updated_at,
    e.triage_updated_by
  from public.ops_app_errors e
  where e.empresa_id = public.current_empresa_id()
    and (not p_only_open or e.resolved = false)
    and (p_source is null or btrim(p_source) = '' or e.source = p_source)
    and (
      p_statuses is null
      or array_length(p_statuses, 1) is null
      or e.status = any (p_statuses::public.ops_app_error_status[])
    )
    and (
      p_q is null or btrim(p_q) = '' or (
        e.message ilike '%' || p_q || '%'
        or coalesce(e.route,'') ilike '%' || p_q || '%'
        or coalesce(e.url,'') ilike '%' || p_q || '%'
        or coalesce(e.request_id,'') ilike '%' || p_q || '%'
        or coalesce(e.code,'') ilike '%' || p_q || '%'
        or coalesce(e.fingerprint,'') ilike '%' || p_q || '%'
      )
    )
  order by e.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.ops_app_errors_list(int,int,boolean,text,text,text[]) from public, anon;
grant execute on function public.ops_app_errors_list(int,int,boolean,text,text,text[]) to authenticated, service_role;


drop function if exists public.ops_app_errors_count(boolean,text,text,text[]);
create or replace function public.ops_app_errors_count(
  p_only_open boolean default true,
  p_q text default null,
  p_source text default null,
  p_statuses text[] default null
)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_permission_for_current_user('ops','view');

  return (
    select count(*)
    from public.ops_app_errors e
    where e.empresa_id = public.current_empresa_id()
      and (not p_only_open or e.resolved = false)
      and (p_source is null or btrim(p_source) = '' or e.source = p_source)
      and (
        p_statuses is null
        or array_length(p_statuses, 1) is null
        or e.status = any (p_statuses::public.ops_app_error_status[])
      )
      and (
        p_q is null or btrim(p_q) = '' or (
          e.message ilike '%' || p_q || '%'
          or coalesce(e.route,'') ilike '%' || p_q || '%'
          or coalesce(e.url,'') ilike '%' || p_q || '%'
          or coalesce(e.request_id,'') ilike '%' || p_q || '%'
          or coalesce(e.code,'') ilike '%' || p_q || '%'
          or coalesce(e.fingerprint,'') ilike '%' || p_q || '%'
        )
      )
  )::int;
end;
$$;

revoke all on function public.ops_app_errors_count(boolean,text,text,text[]) from public, anon;
grant execute on function public.ops_app_errors_count(boolean,text,text,text[]) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- RPC: set status (triagem)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_app_errors_set_status(uuid, text, text);
create or replace function public.ops_app_errors_set_status(
  p_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.ops_app_error_status;
  v_resolved boolean;
begin
  perform public.require_permission_for_current_user('ops','manage');

  v_status := p_status::public.ops_app_error_status;
  v_resolved := v_status in ('corrigido', 'ignorado');

  update public.ops_app_errors e
     set status = v_status,
         resolved = v_resolved,
         resolved_at = case when v_resolved then now() else null end,
         resolved_by = case when v_resolved then public.current_user_id() else null end,
         triage_note = nullif(p_note,''),
         triage_updated_at = now(),
         triage_updated_by = public.current_user_id()
   where e.id = p_id
     and e.empresa_id = public.current_empresa_id();
end;
$$;

revoke all on function public.ops_app_errors_set_status(uuid, text, text) from public, anon;
grant execute on function public.ops_app_errors_set_status(uuid, text, text) to authenticated, service_role;


-- Compat: manter set_resolved atualizando também status
drop function if exists public.ops_app_errors_set_resolved(uuid,boolean);
create or replace function public.ops_app_errors_set_resolved(
  p_id uuid,
  p_resolved boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_resolved boolean := coalesce(p_resolved, false);
begin
  perform public.require_permission_for_current_user('ops','manage');

  update public.ops_app_errors e
     set resolved = v_resolved,
         status = case when v_resolved then 'corrigido' else 'novo' end,
         resolved_at = case when v_resolved then now() else null end,
         resolved_by = case when v_resolved then public.current_user_id() else null end,
         triage_updated_at = now(),
         triage_updated_by = public.current_user_id()
   where e.id = p_id
     and e.empresa_id = public.current_empresa_id();
end;
$$;

revoke all on function public.ops_app_errors_set_resolved(uuid,boolean) from public, anon;
grant execute on function public.ops_app_errors_set_resolved(uuid,boolean) to authenticated, service_role;

commit;
