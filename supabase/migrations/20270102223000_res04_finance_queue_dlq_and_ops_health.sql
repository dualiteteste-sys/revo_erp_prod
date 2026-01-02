/*
  RES-04: Filas por domínio (NF/marketplace/financeiro) + DLQ + reprocessamento seguro

  Estado atual:
  - Marketplace: já possui `ecommerce_jobs` + `ecommerce_job_dead_letters`.
  - NF-e: webhooks em `fiscal_nfe_webhook_events` + reprocess RPC.

  Esta migration adiciona:
  - Financeiro: `finance_jobs` + `finance_job_dead_letters` (DLQ) e RPCs de reprocesso.
  - Health: inclui contadores da fila do financeiro no `ops_health_summary`.
*/

BEGIN;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Tabelas de fila (financeiro)
-- -----------------------------------------------------------------------------
create table if not exists public.finance_jobs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_at timestamptz null,
  locked_by text null,
  process_attempts int not null default 0,
  next_retry_at timestamptz null,
  last_error text null
);

create unique index if not exists idx_finance_jobs_idemp
  on public.finance_jobs (empresa_id, job_type, idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';

create index if not exists idx_finance_jobs_pending
  on public.finance_jobs (empresa_id, status, next_retry_at, updated_at desc);

alter table public.finance_jobs enable row level security;
alter table public.finance_jobs force row level security;

drop policy if exists finance_jobs_select on public.finance_jobs;
create policy finance_jobs_select
  on public.finance_jobs
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id() and public.has_permission_for_current_user('ops','view'));

drop policy if exists finance_jobs_write_service_role on public.finance_jobs;
create policy finance_jobs_write_service_role
  on public.finance_jobs
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.finance_jobs to authenticated, service_role;
grant insert, update, delete on table public.finance_jobs to service_role;

create table if not exists public.finance_job_dead_letters (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  job_id uuid null,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text null,
  dead_lettered_at timestamptz not null default now(),
  last_error text null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_finance_dlq_empresa_dead_lettered_at on public.finance_job_dead_letters(empresa_id, dead_lettered_at desc);

alter table public.finance_job_dead_letters enable row level security;
alter table public.finance_job_dead_letters force row level security;

drop policy if exists finance_dlq_select on public.finance_job_dead_letters;
create policy finance_dlq_select
  on public.finance_job_dead_letters
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id() and public.has_permission_for_current_user('ops','view'));

drop policy if exists finance_dlq_write_service_role on public.finance_job_dead_letters;
create policy finance_dlq_write_service_role
  on public.finance_job_dead_letters
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.finance_job_dead_letters to authenticated, service_role;
grant insert, update, delete on table public.finance_job_dead_letters to service_role;

-- updated_at trigger (se existir helper)
DO $$
BEGIN
  IF to_regprocedure('public.tg_set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS tg_finance_jobs_updated_at ON public.finance_jobs';
  EXECUTE 'CREATE TRIGGER tg_finance_jobs_updated_at BEFORE UPDATE ON public.finance_jobs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()';
END $$;

-- -----------------------------------------------------------------------------
-- 2) RPCs (service_role worker + ops reprocess)
-- -----------------------------------------------------------------------------
drop function if exists public.finance_jobs_enqueue(text, jsonb, text);
create function public.finance_jobs_enqueue(
  p_job_type text,
  p_payload jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_type text := coalesce(nullif(btrim(p_job_type),''), 'finance');
  v_idemp text := nullif(btrim(coalesce(p_idempotency_key,'')), '');
begin
  perform public.require_permission_for_current_user('tesouraria','manage');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode='42501';
  end if;

  insert into public.finance_jobs(empresa_id, job_type, payload, idempotency_key, status, next_retry_at)
  values (v_empresa, v_type, coalesce(p_payload,'{}'::jsonb), v_idemp, 'pending', now())
  on conflict (empresa_id, job_type, idempotency_key)
    where idempotency_key is not null and btrim(idempotency_key) <> ''
  do update set
    payload = excluded.payload,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.finance_jobs_enqueue(text, jsonb, text) from public;
grant execute on function public.finance_jobs_enqueue(text, jsonb, text) to authenticated, service_role;

drop function if exists public.finance_jobs_claim(integer, text);
create function public.finance_jobs_claim(p_limit integer default 10, p_worker_id text default null)
returns setof public.finance_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_worker text := coalesce(nullif(btrim(p_worker_id),''), 'worker');
begin
  -- Somente service_role (worker)
  if current_user <> 'service_role' then
    raise exception 'Somente service_role' using errcode='42501';
  end if;

  return query
  with cte as (
    select j.id
    from public.finance_jobs j
    where j.status in ('pending','failed')
      and (j.next_retry_at is null or j.next_retry_at <= now())
      and (j.locked_at is null or j.locked_at < (now() - interval '10 minutes'))
    order by j.updated_at asc
    limit greatest(coalesce(p_limit,10), 1)
    for update skip locked
  )
  update public.finance_jobs j
     set status = 'processing',
         locked_at = now(),
         locked_by = v_worker,
         process_attempts = j.process_attempts + 1,
         updated_at = now()
    from cte
   where j.id = cte.id
  returning j.*;
end;
$$;

revoke all on function public.finance_jobs_claim(integer, text) from public;
grant execute on function public.finance_jobs_claim(integer, text) to service_role;

drop function if exists public.finance_jobs_finish(uuid, text, text, integer);
create function public.finance_jobs_finish(
  p_id uuid,
  p_status text,
  p_error text default null,
  p_max_attempts integer default 10
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.finance_jobs%rowtype;
  v_done boolean := lower(coalesce(p_status,'')) in ('done','success','ok');
  v_fail boolean := lower(coalesce(p_status,'')) in ('failed','error');
begin
  if current_user <> 'service_role' then
    raise exception 'Somente service_role' using errcode='42501';
  end if;

  select * into v_job
  from public.finance_jobs
  where id = p_id
  for update;

  if not found then
    return;
  end if;

  if v_done then
    update public.finance_jobs
       set status = 'done',
           last_error = null,
           locked_at = null,
           locked_by = null,
           next_retry_at = null,
           updated_at = now()
     where id = p_id;
    return;
  end if;

  if v_fail then
    if v_job.process_attempts >= greatest(coalesce(p_max_attempts,10), 1) then
      insert into public.finance_job_dead_letters(empresa_id, job_id, job_type, payload, idempotency_key, last_error, meta)
      values (v_job.empresa_id, v_job.id, v_job.job_type, v_job.payload, v_job.idempotency_key, left(coalesce(p_error,'erro'), 2000),
              jsonb_build_object('attempts', v_job.process_attempts, 'locked_by', v_job.locked_by));
      delete from public.finance_jobs where id = p_id;
    else
      update public.finance_jobs
         set status = 'failed',
             last_error = left(coalesce(p_error,'erro'), 2000),
             locked_at = null,
             locked_by = null,
             next_retry_at = now() + interval '2 minutes',
             updated_at = now()
       where id = p_id;
    end if;
  end if;
end;
$$;

revoke all on function public.finance_jobs_finish(uuid, text, text, integer) from public;
grant execute on function public.finance_jobs_finish(uuid, text, text, integer) to service_role;

drop function if exists public.ops_finance_job_reprocess(uuid);
create function public.ops_finance_job_reprocess(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('ops','manage');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode='42501';
  end if;

  update public.finance_jobs
     set status = 'pending',
         next_retry_at = now(),
         locked_at = null,
         locked_by = null,
         last_error = null,
         updated_at = now()
   where id = p_id
     and empresa_id = v_empresa;
end;
$$;

revoke all on function public.ops_finance_job_reprocess(uuid) from public;
grant execute on function public.ops_finance_job_reprocess(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) OPS-06: health inclui financeiro (se função existir, substitui)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.ops_health_summary(interval)') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
  CREATE OR REPLACE FUNCTION public.ops_health_summary(p_window interval default interval '24 hours')
  returns jsonb
  language plpgsql
  security definer
  set search_path = pg_catalog, public, audit
  as $fn$
  declare
    v_empresa uuid := public.current_empresa_id();
    v_from timestamptz := now() - coalesce(p_window, interval '24 hours');
    v_app_errors int := 0;
    v_db_events int := 0;
    v_nfe_pending int := 0;
    v_nfe_failed int := 0;
    v_nfe_locked int := 0;
    v_fin_pending int := 0;
    v_fin_failed int := 0;
    v_fin_locked int := 0;
  begin
    perform public.require_permission_for_current_user('ops','view');

    if v_empresa is null then
      raise exception 'empresa_id inválido' using errcode = '42501';
    end if;

    select count(*)::int into v_app_errors
    from public.app_logs
    where empresa_id = v_empresa
      and level = 'error'
      and created_at >= v_from;

    select count(*)::int into v_db_events
    from public.audit_logs
    where empresa_id = v_empresa
      and changed_at >= v_from;

    if to_regclass('public.fiscal_nfe_webhook_events') is not null then
      select count(*)::int into v_nfe_pending
      from public.fiscal_nfe_webhook_events
      where empresa_id = v_empresa
        and processed_at is null
        and (next_retry_at is null or next_retry_at <= now())
        and (locked_at is null or locked_at < (now() - interval '10 minutes'));

      select count(*)::int into v_nfe_failed
      from public.fiscal_nfe_webhook_events
      where empresa_id = v_empresa
        and processed_at is null
        and last_error is not null;

      select count(*)::int into v_nfe_locked
      from public.fiscal_nfe_webhook_events
      where empresa_id = v_empresa
        and processed_at is null
        and locked_at is not null
        and locked_at >= (now() - interval '10 minutes');
    end if;

    if to_regclass('public.finance_jobs') is not null then
      select count(*)::int into v_fin_pending
      from public.finance_jobs
      where empresa_id = v_empresa
        and status in ('pending','processing')
        and (next_retry_at is null or next_retry_at <= now())
        and (locked_at is null or locked_at < (now() - interval '10 minutes'));

      select count(*)::int into v_fin_failed
      from public.finance_jobs
      where empresa_id = v_empresa
        and status = 'failed'
        and last_error is not null;

      select count(*)::int into v_fin_locked
      from public.finance_jobs
      where empresa_id = v_empresa
        and status = 'processing'
        and locked_at is not null
        and locked_at >= (now() - interval '10 minutes');
    end if;

    return jsonb_build_object(
      'from', v_from,
      'to', now(),
      'app_errors', v_app_errors,
      'db_events', v_db_events,
      'nfeio', jsonb_build_object(
        'pending', v_nfe_pending,
        'failed', v_nfe_failed,
        'locked', v_nfe_locked
      ),
      'finance', jsonb_build_object(
        'pending', v_fin_pending,
        'failed', v_fin_failed,
        'locked', v_fin_locked
      )
    );
  end;
  $fn$;
  $sql$;
END $$;

COMMIT;

