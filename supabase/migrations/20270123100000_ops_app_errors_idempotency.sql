/*
  OPS: Erros no Sistema — Idempotência por fingerprint

  Problema:
  - O frontend envia o mesmo erro várias vezes (por re-ocorrência e/ou múltiplos handlers),
    e o RPC `ops_app_errors_log_v1` apenas insere novas linhas.

  Solução:
  - Normaliza para 1 linha por (empresa_id, fingerprint) via upsert.
  - Adiciona `occurrences` + `last_seen_at` para visibilidade de recorrência.
  - Ajusta list/count para ordenar/filtrar por `last_seen_at` (fallback created_at).
*/

begin;

alter table public.ops_app_errors
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists occurrences int not null default 1;

update public.ops_app_errors
   set last_seen_at = coalesce(last_seen_at, created_at)
 where last_seen_at is null;

-- -----------------------------------------------------------------------------
-- Dedup histórico (mantém 1 linha por fingerprint e soma occurrences)
-- -----------------------------------------------------------------------------
with ranked as (
  select
    e.*,
    row_number() over (
      partition by e.empresa_id, e.fingerprint
      order by e.created_at asc, e.id asc
    ) as rn_keep,
    row_number() over (
      partition by e.empresa_id, e.fingerprint
      order by e.created_at desc, e.id desc
    ) as rn_latest,
    count(*) over (partition by e.empresa_id, e.fingerprint) as cnt,
    min(e.created_at) over (partition by e.empresa_id, e.fingerprint) as first_seen,
    max(e.created_at) over (partition by e.empresa_id, e.fingerprint) as last_seen
  from public.ops_app_errors e
  where e.empresa_id is not null
    and e.fingerprint is not null
    and btrim(e.fingerprint) <> ''
),
keepers as (
  select * from ranked where rn_keep = 1 and cnt > 1
),
latests as (
  select * from ranked where rn_latest = 1 and cnt > 1
)
update public.ops_app_errors k
   set created_at = keepers.first_seen,
       last_seen_at = keepers.last_seen,
       occurrences = keepers.cnt,
       -- "último contexto" (best-effort)
       user_id = e_latest.user_id,
       source = e_latest.source,
       route = e_latest.route,
       last_action = e_latest.last_action,
       message = e_latest.message,
       stack = e_latest.stack,
       request_id = e_latest.request_id,
       url = e_latest.url,
       method = e_latest.method,
       http_status = e_latest.http_status,
       code = e_latest.code,
       response_text = e_latest.response_text
  from keepers
  join latests
    on latests.empresa_id = keepers.empresa_id
   and latests.fingerprint = keepers.fingerprint
  join public.ops_app_errors e_latest
    on e_latest.id = latests.id
 where k.id = keepers.id;

delete from public.ops_app_errors d
using (
  with ranked as (
    select
      e.id,
      count(*) over (partition by e.empresa_id, e.fingerprint) as cnt,
      row_number() over (
        partition by e.empresa_id, e.fingerprint
        order by e.created_at asc, e.id asc
      ) as rn_keep
    from public.ops_app_errors e
    where e.empresa_id is not null
      and e.fingerprint is not null
      and btrim(e.fingerprint) <> ''
  )
  select id
  from ranked
  where cnt > 1
    and rn_keep > 1
) x
where d.id = x.id;

-- -----------------------------------------------------------------------------
-- Unicidade por fingerprint (tenant-safe) + índice para listagem
-- -----------------------------------------------------------------------------
create unique index if not exists ux_ops_app_errors_empresa_fingerprint
  on public.ops_app_errors (empresa_id, fingerprint)
  where empresa_id is not null
    and fingerprint is not null
    and btrim(fingerprint) <> '';

create index if not exists idx_ops_app_errors_empresa_last_seen_at
  on public.ops_app_errors (empresa_id, last_seen_at desc);

-- -----------------------------------------------------------------------------
-- RPC: log (agora idempotente)
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
  p_fingerprint text
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
    -- Se estava resolvido/ignorado e o erro reapareceu, reabrir automaticamente
    status = case
      when public.ops_app_errors.status in ('corrigido','ignorado') then 'novo'::public.ops_app_error_status
      else public.ops_app_errors.status
    end,
    resolved = case
      when public.ops_app_errors.status in ('corrigido','ignorado') then false
      else public.ops_app_errors.resolved
    end,
    resolved_at = case
      when public.ops_app_errors.status in ('corrigido','ignorado') then null
      else public.ops_app_errors.resolved_at
    end,
    resolved_by = case
      when public.ops_app_errors.status in ('corrigido','ignorado') then null
      else public.ops_app_errors.resolved_by
    end,
    triage_updated_at = case
      when public.ops_app_errors.status in ('corrigido','ignorado') then now()
      else public.ops_app_errors.triage_updated_at
    end,
    triage_updated_by = case
      when public.ops_app_errors.status in ('corrigido','ignorado') then excluded.user_id
      else public.ops_app_errors.triage_updated_by
    end;
end;
$$;

revoke all on function public.ops_app_errors_log_v1(
  text, text, text, text, text, text, text, text, int, text, text, text
) from public, anon;
grant execute on function public.ops_app_errors_log_v1(
  text, text, text, text, text, text, text, text, int, text, text, text
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: list/count (agora com last_seen_at/occurrences e filtro por last_seen_at)
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


drop function if exists public.ops_app_errors_count(boolean,text,text,text[],timestamptz,timestamptz);
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
  )::int;
end;
$$;

revoke all on function public.ops_app_errors_count(boolean,text,text,text[],timestamptz,timestamptz) from public, anon;
grant execute on function public.ops_app_errors_count(boolean,text,text,text[],timestamptz,timestamptz) to authenticated, service_role;

commit;

