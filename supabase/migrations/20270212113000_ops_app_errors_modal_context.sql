-- Ops App Errors: anexar contexto (rota base + modal stack) sem quebrar idempotência.
-- Motivação: erros em modais/drawers não mudam URL; precisamos registrar contexto correto para triagem/reprodução.

begin;

alter table if exists public.ops_app_errors
  add column if not exists context jsonb not null default '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- RPC: log v1 (agora aceita p_context jsonb)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_app_errors_log_v1(
  text, text, text, text, text, text, text, text, int, text, text, text
);

create or replace function public.ops_app_errors_log_v1(
  p_source text,
  p_route text,
  p_last_action text,
  p_message text,
  p_stack text,
  p_request_id text,
  p_url text,
  p_method text,
  p_http_status int,
  p_code text,
  p_response_text text,
  p_fingerprint text,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_empresa_id uuid := public.current_empresa_id();
  v_fingerprint text := nullif(btrim(coalesce(p_fingerprint, '')), '');
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
begin
  if v_user_id is null then
    return;
  end if;

  if v_empresa_id is null then
    v_empresa_id := public.get_preferred_empresa_for_user(v_user_id);
  end if;

  if v_empresa_id is null then
    return;
  end if;

  if v_fingerprint is null then
    v_fingerprint := left(
      coalesce(nullif(p_route,''),'') || '|' ||
      coalesce(nullif(p_code,''),'') || '|' ||
      coalesce(p_http_status::text,'') || '|' ||
      coalesce(nullif(p_method,''),'') || '|' ||
      split_part(coalesce(nullif(p_url,''),''), '?', 1) || '|' ||
      coalesce(nullif(p_message,''),'APP_ERROR'),
      500
    );
  end if;

  insert into public.ops_app_errors (
    empresa_id,
    user_id,
    source,
    route,
    last_action,
    message,
    stack,
    request_id,
    url,
    method,
    http_status,
    code,
    response_text,
    fingerprint,
    context,
    last_seen_at,
    occurrences
  ) values (
    v_empresa_id,
    v_user_id,
    coalesce(nullif(p_source,''), 'console.error'),
    nullif(p_route,''),
    nullif(p_last_action,''),
    coalesce(nullif(p_message,''), 'APP_ERROR'),
    nullif(p_stack,''),
    nullif(p_request_id,''),
    nullif(p_url,''),
    nullif(p_method,''),
    p_http_status,
    nullif(p_code,''),
    nullif(p_response_text,''),
    v_fingerprint,
    v_context,
    now(),
    1
  )
  on conflict (empresa_id, fingerprint)
  where empresa_id is not null and fingerprint is not null and btrim(fingerprint) <> ''
  do update set
    last_seen_at = now(),
    occurrences = public.ops_app_errors.occurrences + 1,
    user_id = excluded.user_id,
    source = excluded.source,
    route = excluded.route,
    last_action = excluded.last_action,
    message = excluded.message,
    stack = excluded.stack,
    request_id = excluded.request_id,
    url = excluded.url,
    method = excluded.method,
    http_status = excluded.http_status,
    code = excluded.code,
    response_text = excluded.response_text,
    context = excluded.context;
end;
$$;

revoke all on function public.ops_app_errors_log_v1(
  text, text, text, text, text, text, text, text, int, text, text, text, jsonb
) from public, anon;
grant execute on function public.ops_app_errors_log_v1(
  text, text, text, text, text, text, text, text, int, text, text, text, jsonb
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: list (inclui context)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_app_errors_list(int,int,boolean,text,text,text[],timestamptz,timestamptz);

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
  last_seen_at timestamptz,
  occurrences int,
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
  context jsonb,
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
    e.last_seen_at,
    e.occurrences,
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
    e.context,
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
    and (p_from is null or coalesce(e.last_seen_at, e.created_at) >= p_from)
    and (p_to is null or coalesce(e.last_seen_at, e.created_at) <= p_to)
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
  order by coalesce(e.last_seen_at, e.created_at) desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.ops_app_errors_list(int,int,boolean,text,text,text[],timestamptz,timestamptz) from public, anon;
grant execute on function public.ops_app_errors_list(int,int,boolean,text,text,text[],timestamptz,timestamptz) to authenticated, service_role;

commit;

