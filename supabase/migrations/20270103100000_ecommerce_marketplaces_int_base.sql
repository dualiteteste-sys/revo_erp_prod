/*
  INT-* (Marketplaces): Base de integrações (Shopee + Mercado Livre)

  Objetivo (MVP bem feito):
  - Modelar conexões por empresa (provider + status + config)
  - Fila de jobs + runs + logs para execução assíncrona (idempotência e observabilidade)
  - Monitor mínimo (health summary) consumido pela UI

  Observação:
  - Tokens/segredos (OAuth) devem ficar acessíveis apenas por service_role.
*/

BEGIN;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 0) Permissões (RBAC)
-- -----------------------------------------------------------------------------
insert into public.permissions(module, action) values
  ('ecommerce','view'),
  ('ecommerce','create'),
  ('ecommerce','update'),
  ('ecommerce','delete'),
  ('ecommerce','manage')
on conflict (module, action) do nothing;

-- OWNER/ADMIN: tudo liberado
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module = 'ecommerce'
where r.slug in ('OWNER','ADMIN')
on conflict do nothing;

-- Outros: somente view (conservador)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module = 'ecommerce' and p.action = 'view'
where r.slug in ('MEMBER','OPS','FINANCE','VIEWER')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 1) Conexões (reaproveita tabela public.ecommerces)
-- -----------------------------------------------------------------------------
alter table public.ecommerces
  add column if not exists provider text not null default 'custom',
  add column if not exists status text not null default 'disconnected',
  add column if not exists external_account_id text null,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists connected_at timestamptz null,
  add column if not exists last_sync_at timestamptz null,
  add column if not exists last_error text null;

-- unique por empresa+provider (1 conexão por canal no MVP)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ecommerces_unique_per_company_provider'
  ) then
    alter table public.ecommerces
      add constraint ecommerces_unique_per_company_provider unique (empresa_id, provider);
  end if;
end $$;

-- Hardening de políticas: restringe CRUD a quem tem permissão ecommerce:manage
drop policy if exists "ecommerces_select_own_company" on public.ecommerces;
drop policy if exists "ecommerces_insert_own_company" on public.ecommerces;
drop policy if exists "ecommerces_update_own_company" on public.ecommerces;
drop policy if exists "ecommerces_delete_own_company" on public.ecommerces;
drop policy if exists "policy_delete" on public.ecommerces;

create policy "ecommerces_select_company_ecommerce_view"
  on public.ecommerces
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','view')
  );

create policy "ecommerces_write_company_ecommerce_manage"
  on public.ecommerces
  for all
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','manage')
  )
  with check (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','manage')
  );

grant select, insert, update, delete on table public.ecommerces to authenticated, service_role;

-- Segredos/tokens por conexão (somente service_role)
create table if not exists public.ecommerce_connection_secrets (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ecommerce_id uuid not null references public.ecommerces(id) on delete cascade,
  access_token text null,
  refresh_token text null,
  token_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ecommerce_connection_secrets_unique unique (ecommerce_id)
);

alter table public.ecommerce_connection_secrets enable row level security;

drop trigger if exists tg_ecommerce_connection_secrets_updated_at on public.ecommerce_connection_secrets;
create trigger tg_ecommerce_connection_secrets_updated_at
before update on public.ecommerce_connection_secrets
for each row execute function public.tg_set_updated_at();

drop policy if exists ecommerce_connection_secrets_service_role on public.ecommerce_connection_secrets;
create policy ecommerce_connection_secrets_service_role
  on public.ecommerce_connection_secrets
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on table public.ecommerce_connection_secrets to service_role;

-- -----------------------------------------------------------------------------
-- 2) Fila de jobs + runs + dead letter
-- -----------------------------------------------------------------------------
create table if not exists public.ecommerce_jobs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ecommerce_id uuid not null references public.ecommerces(id) on delete cascade,
  provider text not null,
  kind text not null,
  dedupe_key text null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  scheduled_for timestamptz null,
  next_retry_at timestamptz null,
  attempts int not null default 0,
  max_attempts int not null default 10,
  locked_at timestamptz null,
  locked_by text null,
  last_error text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ecommerce_jobs_status_check check (status in ('pending','processing','done','error','dead')),
  constraint ecommerce_jobs_provider_check check (provider in ('meli','shopee','custom'))
);

alter table public.ecommerce_jobs enable row level security;

drop trigger if exists tg_ecommerce_jobs_updated_at on public.ecommerce_jobs;
create trigger tg_ecommerce_jobs_updated_at
before update on public.ecommerce_jobs
for each row execute function public.tg_set_updated_at();

drop policy if exists ecommerce_jobs_select on public.ecommerce_jobs;
create policy ecommerce_jobs_select
  on public.ecommerce_jobs
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','view')
  );

drop policy if exists ecommerce_jobs_write_service_role on public.ecommerce_jobs;
create policy ecommerce_jobs_write_service_role
  on public.ecommerce_jobs
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.ecommerce_jobs to authenticated, service_role;
grant insert, update, delete on table public.ecommerce_jobs to service_role;

create unique index if not exists ecommerce_jobs_dedupe_unique
  on public.ecommerce_jobs (provider, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_ecommerce_jobs_pending
  on public.ecommerce_jobs (provider, status, next_retry_at, scheduled_for, created_at desc);

create index if not exists idx_ecommerce_jobs_empresa
  on public.ecommerce_jobs (empresa_id, created_at desc);

create table if not exists public.ecommerce_job_runs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  job_id uuid not null references public.ecommerce_jobs(id) on delete cascade,
  provider text not null,
  kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  ok boolean not null default false,
  error text null,
  meta jsonb not null default '{}'::jsonb
);

alter table public.ecommerce_job_runs enable row level security;

drop policy if exists ecommerce_job_runs_select on public.ecommerce_job_runs;
create policy ecommerce_job_runs_select
  on public.ecommerce_job_runs
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','view')
  );

drop policy if exists ecommerce_job_runs_write_service_role on public.ecommerce_job_runs;
create policy ecommerce_job_runs_write_service_role
  on public.ecommerce_job_runs
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.ecommerce_job_runs to authenticated, service_role;
grant insert, update, delete on table public.ecommerce_job_runs to service_role;

create index if not exists idx_ecommerce_job_runs_empresa
  on public.ecommerce_job_runs (empresa_id, started_at desc);

create table if not exists public.ecommerce_job_dead_letters (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  provider text not null,
  kind text not null,
  dedupe_key text null,
  payload jsonb not null default '{}'::jsonb,
  last_error text not null default '',
  failed_at timestamptz not null default now()
);

alter table public.ecommerce_job_dead_letters enable row level security;

drop policy if exists ecommerce_job_dead_letters_select on public.ecommerce_job_dead_letters;
create policy ecommerce_job_dead_letters_select
  on public.ecommerce_job_dead_letters
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','view')
  );

drop policy if exists ecommerce_job_dead_letters_write_service_role on public.ecommerce_job_dead_letters;
create policy ecommerce_job_dead_letters_write_service_role
  on public.ecommerce_job_dead_letters
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.ecommerce_job_dead_letters to authenticated, service_role;
grant insert, update, delete on table public.ecommerce_job_dead_letters to service_role;

create index if not exists idx_ecommerce_job_dead_letters_empresa
  on public.ecommerce_job_dead_letters (empresa_id, failed_at desc);

-- -----------------------------------------------------------------------------
-- 3) Logs estruturados (por provider/entidade)
-- -----------------------------------------------------------------------------
create table if not exists public.ecommerce_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ecommerce_id uuid null references public.ecommerces(id) on delete set null,
  provider text not null,
  level text not null default 'info',
  event text not null default '',
  message text not null default '',
  entity_type text null,
  entity_external_id text null,
  entity_id uuid null,
  run_id uuid null references public.ecommerce_job_runs(id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ecommerce_logs_level_check check (level in ('debug','info','warn','error'))
);

alter table public.ecommerce_logs enable row level security;

drop policy if exists ecommerce_logs_select on public.ecommerce_logs;
create policy ecommerce_logs_select
  on public.ecommerce_logs
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','view')
  );

drop policy if exists ecommerce_logs_write_service_role on public.ecommerce_logs;
create policy ecommerce_logs_write_service_role
  on public.ecommerce_logs
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.ecommerce_logs to authenticated, service_role;
grant insert, update, delete on table public.ecommerce_logs to service_role;

create index if not exists idx_ecommerce_logs_empresa
  on public.ecommerce_logs (empresa_id, created_at desc);

create index if not exists idx_ecommerce_logs_provider
  on public.ecommerce_logs (provider, created_at desc);

-- -----------------------------------------------------------------------------
-- 4) RPCs para UI (com guard de permissão)
-- -----------------------------------------------------------------------------
drop function if exists public.ecommerce_connections_list();
create function public.ecommerce_connections_list()
returns table(
  id uuid,
  empresa_id uuid,
  provider text,
  nome text,
  status text,
  external_account_id text,
  config jsonb,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('ecommerce','view');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  return query
  select
    e.id, e.empresa_id, e.provider, e.nome, e.status, e.external_account_id, e.config,
    e.connected_at, e.last_sync_at, e.last_error, e.created_at, e.updated_at
  from public.ecommerces e
  where e.empresa_id = v_empresa
    and e.provider in ('meli','shopee')
  order by e.provider asc, e.created_at desc;
end;
$$;

revoke all on function public.ecommerce_connections_list() from public;
grant execute on function public.ecommerce_connections_list() to authenticated, service_role;

drop function if exists public.ecommerce_connections_upsert(text, text, text, text, jsonb);
create function public.ecommerce_connections_upsert(
  p_provider text,
  p_nome text,
  p_status text default null,
  p_external_account_id text default null,
  p_config jsonb default null
)
returns public.ecommerces
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_row public.ecommerces;
begin
  perform public.require_permission_for_current_user('ecommerce','manage');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;
  if p_provider not in ('meli','shopee') then
    raise exception 'provider inválido' using errcode = '22023';
  end if;

  insert into public.ecommerces (empresa_id, nome, provider, status, external_account_id, config, connected_at)
  values (
    v_empresa,
    p_nome,
    p_provider,
    coalesce(p_status, 'pending'),
    p_external_account_id,
    coalesce(p_config, '{}'::jsonb),
    case when coalesce(p_status,'pending') = 'connected' then now() else null end
  )
  on conflict (empresa_id, provider)
  do update set
    nome = excluded.nome,
    status = excluded.status,
    external_account_id = excluded.external_account_id,
    config = excluded.config,
    connected_at = case when excluded.status = 'connected' then coalesce(public.ecommerces.connected_at, now()) else public.ecommerces.connected_at end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.ecommerce_connections_upsert(text, text, text, text, jsonb) from public;
grant execute on function public.ecommerce_connections_upsert(text, text, text, text, jsonb) to authenticated, service_role;

drop function if exists public.ecommerce_connections_update_config(uuid, jsonb);
create function public.ecommerce_connections_update_config(p_id uuid, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('ecommerce','manage');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  update public.ecommerces
  set config = coalesce(p_config, '{}'::jsonb),
      updated_at = now()
  where id = p_id
    and empresa_id = v_empresa;

  if not found then
    raise exception 'Conexão não encontrada' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.ecommerce_connections_update_config(uuid, jsonb) from public;
grant execute on function public.ecommerce_connections_update_config(uuid, jsonb) to authenticated, service_role;

drop function if exists public.ecommerce_connections_disconnect(uuid);
create function public.ecommerce_connections_disconnect(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('ecommerce','manage');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  update public.ecommerces
  set
    status = 'disconnected',
    external_account_id = null,
    connected_at = null,
    last_sync_at = null,
    last_error = null,
    updated_at = now()
  where id = p_id
    and empresa_id = v_empresa;

  delete from public.ecommerce_connection_secrets
  where ecommerce_id = p_id
    and empresa_id = v_empresa;
end;
$$;

revoke all on function public.ecommerce_connections_disconnect(uuid) from public;
grant execute on function public.ecommerce_connections_disconnect(uuid) to authenticated, service_role;

drop function if exists public.ecommerce_health_summary(interval);
create function public.ecommerce_health_summary(p_window interval default interval '24 hours')
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_from timestamptz := now() - coalesce(p_window, interval '24 hours');
  v_pending int := 0;
  v_failed_24h int := 0;
  v_last_sync timestamptz := null;
begin
  perform public.require_permission_for_current_user('ecommerce','view');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  select count(*)::int into v_pending
  from public.ecommerce_jobs
  where empresa_id = v_empresa
    and status in ('pending','processing')
    and (next_retry_at is null or next_retry_at <= now());

  select count(*)::int into v_failed_24h
  from public.ecommerce_jobs
  where empresa_id = v_empresa
    and last_error is not null
    and updated_at >= v_from;

  select max(last_sync_at) into v_last_sync
  from public.ecommerces
  where empresa_id = v_empresa
    and provider in ('meli','shopee');

  return jsonb_build_object(
    'pending', v_pending,
    'failed_24h', v_failed_24h,
    'last_sync_at', v_last_sync
  );
end;
$$;

revoke all on function public.ecommerce_health_summary(interval) from public;
grant execute on function public.ecommerce_health_summary(interval) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

