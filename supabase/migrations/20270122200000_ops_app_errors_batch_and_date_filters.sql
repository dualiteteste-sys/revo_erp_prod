/*
  OPS: Erros no Sistema (triagem)
  - Filtro por data (created_at) no list/count
  - Ação em lote: set_status_many (ex.: ignorar selecionados)
*/

begin;

-- -----------------------------------------------------------------------------
-- RPC: list/count (adiciona p_from/p_to com default)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_app_errors_list(int,int,boolean,text,text,text[]);
create or replace function public.ops_app_errors_list(
  p_limit int default 50,
  p_offset int default 0,
  p_only_open boolean default true,
  p_q text default null,
  p_source text default null,
  p_statuses text[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null
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
    and (p_from is null or e.created_at >= p_from)
    and (p_to is null or e.created_at <= p_to)
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

revoke all on function public.ops_app_errors_list(int,int,boolean,text,text,text[],timestamptz,timestamptz) from public, anon;
grant execute on function public.ops_app_errors_list(int,int,boolean,text,text,text[],timestamptz,timestamptz) to authenticated, service_role;


drop function if exists public.ops_app_errors_count(boolean,text,text,text[]);
create or replace function public.ops_app_errors_count(
  p_only_open boolean default true,
  p_q text default null,
  p_source text default null,
  p_statuses text[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null
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
      and (p_from is null or e.created_at >= p_from)
      and (p_to is null or e.created_at <= p_to)
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

revoke all on function public.ops_app_errors_count(boolean,text,text,text[],timestamptz,timestamptz) from public, anon;
grant execute on function public.ops_app_errors_count(boolean,text,text,text[],timestamptz,timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: set status (bulk)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_app_errors_set_status_many(uuid[], text, text);
create or replace function public.ops_app_errors_set_status_many(
  p_ids uuid[],
  p_status text,
  p_note text default null
)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.ops_app_error_status;
  v_resolved boolean;
  v_updated int := 0;
begin
  perform public.require_permission_for_current_user('ops','manage');

  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

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
   where e.empresa_id = public.current_empresa_id()
     and e.id = any (p_ids);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.ops_app_errors_set_status_many(uuid[], text, text) from public, anon;
grant execute on function public.ops_app_errors_set_status_many(uuid[], text, text) to authenticated, service_role;

commit;

