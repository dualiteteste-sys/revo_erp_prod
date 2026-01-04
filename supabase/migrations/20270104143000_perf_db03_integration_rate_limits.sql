/*
  PERF-DB-03 (P1) Rate limit/backoff por canal/ação (integrações, emissão)

  Motivo:
  - Proteger DB e integrações externas contra "burst" (cliques repetidos, loops, bots).
  - Padronizar resposta com retry_after para backoff no Edge/UI.

  Impacto:
  - Cria tabela `public.integration_rate_limit_counters` (somente service_role).
  - Cria RPC `public.integration_rate_limit_check(...)` (service_role) para checar/incrementar.

  Reversibilidade:
  - Seguro: remover tabela/função (não altera schema de domínio).
*/

BEGIN;

create extension if not exists pgcrypto;

create table if not exists public.integration_rate_limit_counters (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  domain text not null,
  action text not null,
  window_seconds int not null,
  window_start timestamptz not null,
  counter int not null default 0,
  updated_at timestamptz not null default now(),
  constraint integration_rate_limit_counters_unique unique (empresa_id, domain, action, window_seconds)
);

alter table public.integration_rate_limit_counters enable row level security;

drop policy if exists integration_rate_limit_counters_service_role on public.integration_rate_limit_counters;
create policy integration_rate_limit_counters_service_role
  on public.integration_rate_limit_counters
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on table public.integration_rate_limit_counters to service_role;

create index if not exists idx_integration_rate_limit_lookup
  on public.integration_rate_limit_counters (empresa_id, domain, action, window_seconds);

create or replace function public.integration_rate_limit_check(
  p_empresa_id uuid,
  p_domain text,
  p_action text,
  p_limit int,
  p_window_seconds int,
  p_cost int default 1
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  now_ts timestamptz := now();
  bucket_start timestamptz;
  row public.integration_rate_limit_counters%rowtype;
  next_reset timestamptz;
  allowed boolean := true;
  retry_after int := 0;
  remaining int := 0;
begin
  if p_limit is null or p_limit <= 0 then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', null, 'remaining', null);
  end if;
  if p_window_seconds is null or p_window_seconds <= 0 then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', null, 'remaining', null);
  end if;
  if p_cost is null or p_cost <= 0 then
    p_cost := 1;
  end if;

  bucket_start :=
    to_timestamp(floor(extract(epoch from now_ts) / p_window_seconds) * p_window_seconds);

  insert into public.integration_rate_limit_counters (empresa_id, domain, action, window_seconds, window_start, counter)
  values (p_empresa_id, p_domain, p_action, p_window_seconds, bucket_start, 0)
  on conflict (empresa_id, domain, action, window_seconds) do nothing;

  select * into row
  from public.integration_rate_limit_counters
  where empresa_id = p_empresa_id
    and domain = p_domain
    and action = p_action
    and window_seconds = p_window_seconds
  for update;

  if row.window_start <> bucket_start then
    update public.integration_rate_limit_counters
    set window_start = bucket_start,
        counter = 0,
        updated_at = now_ts
    where id = row.id;
    row.counter := 0;
    row.window_start := bucket_start;
  end if;

  if (row.counter + p_cost) > p_limit then
    allowed := false;
    next_reset := row.window_start + make_interval(secs => p_window_seconds);
    retry_after := greatest(1, ceil(extract(epoch from (next_reset - now_ts)))::int);
    remaining := 0;
  else
    allowed := true;
    update public.integration_rate_limit_counters
    set counter = row.counter + p_cost,
        updated_at = now_ts
    where id = row.id;
    remaining := greatest(0, p_limit - (row.counter + p_cost));
  end if;

  return jsonb_build_object(
    'allowed', allowed,
    'retry_after_seconds', case when allowed then null else retry_after end,
    'remaining', remaining,
    'window_seconds', p_window_seconds
  );
end;
$$;

revoke all on function public.integration_rate_limit_check(uuid, text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.integration_rate_limit_check(uuid, text, text, int, int, int) to service_role;

COMMIT;

