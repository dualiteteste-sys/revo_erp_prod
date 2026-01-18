/*
  P1.2 (piloto: Financeiro) + P6 (gates):
  - Fortalece RPC-first no Financeiro: revoga grants diretos em tabelas `financeiro_*`/`finance_*`.
  - Evita que páginas de Ops dependam de `supabase.from()` em tabelas internas, criando RPCs SECURITY DEFINER.
*/

begin;

-- -----------------------------------------------------------------------------
-- Ops: listas internas (HealthPage)
-- -----------------------------------------------------------------------------

drop function if exists public.ops_finance_dlq_list(int);
create or replace function public.ops_finance_dlq_list(
  p_limit int default 30
)
returns table (
  id uuid,
  dead_lettered_at timestamptz,
  job_type text,
  idempotency_key text,
  last_error text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 30), 0), 200);
begin
  -- Ops-only
  if not public.has_permission_for_current_user('ops','manage') then
    return;
  end if;

  return query
  select
    d.id,
    d.dead_lettered_at,
    d.job_type,
    d.idempotency_key,
    d.last_error
  from public.finance_job_dead_letters d
  order by d.dead_lettered_at desc
  limit v_limit;
end;
$$;

revoke all on function public.ops_finance_dlq_list(int) from public, anon;
grant execute on function public.ops_finance_dlq_list(int) to authenticated, service_role;


drop function if exists public.ops_ecommerce_dlq_list(int);
create or replace function public.ops_ecommerce_dlq_list(
  p_limit int default 30
)
returns table (
  id uuid,
  failed_at timestamptz,
  provider text,
  kind text,
  dedupe_key text,
  last_error text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 30), 0), 200);
begin
  -- Ops-only
  if not public.has_permission_for_current_user('ops','manage') then
    return;
  end if;

  return query
  select
    d.id,
    d.failed_at,
    d.provider,
    d.kind,
    d.dedupe_key,
    d.last_error
  from public.ecommerce_job_dead_letters d
  order by d.failed_at desc
  limit v_limit;
end;
$$;

revoke all on function public.ops_ecommerce_dlq_list(int) from public, anon;
grant execute on function public.ops_ecommerce_dlq_list(int) to authenticated, service_role;


drop function if exists public.ops_fiscal_nfe_webhook_errors_list(int);
create or replace function public.ops_fiscal_nfe_webhook_errors_list(
  p_limit int default 30
)
returns table (
  id uuid,
  received_at timestamptz,
  event_type text,
  provider text,
  nfeio_id text,
  process_attempts int,
  next_retry_at timestamptz,
  locked_at timestamptz,
  last_error text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 30), 0), 200);
begin
  -- Ops-only
  if not public.has_permission_for_current_user('ops','manage') then
    return;
  end if;

  return query
  select
    e.id,
    e.received_at,
    e.event_type,
    e.provider,
    e.nfeio_id,
    e.process_attempts,
    e.next_retry_at,
    e.locked_at,
    e.last_error
  from public.fiscal_nfe_webhook_events e
  where e.processed_at is null
    and e.last_error is not null
  order by e.received_at desc
  limit v_limit;
end;
$$;

revoke all on function public.ops_fiscal_nfe_webhook_errors_list(int) from public, anon;
grant execute on function public.ops_fiscal_nfe_webhook_errors_list(int) to authenticated, service_role;


drop function if exists public.ops_billing_stripe_webhook_errors_list(int);
create or replace function public.ops_billing_stripe_webhook_errors_list(
  p_limit int default 30
)
returns table (
  id uuid,
  received_at timestamptz,
  event_type text,
  stripe_event_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  plan_slug text,
  billing_cycle text,
  process_attempts int,
  next_retry_at timestamptz,
  locked_at timestamptz,
  last_error text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 30), 0), 200);
begin
  -- Ops-only
  if not public.has_permission_for_current_user('ops','manage') then
    return;
  end if;

  return query
  select
    e.id,
    e.received_at,
    e.event_type,
    e.stripe_event_id,
    e.stripe_subscription_id,
    e.stripe_price_id,
    e.plan_slug,
    e.billing_cycle,
    e.process_attempts,
    e.next_retry_at,
    e.locked_at,
    e.last_error
  from public.billing_stripe_webhook_events e
  where e.processed_at is null
    and e.last_error is not null
  order by e.received_at desc
  limit v_limit;
end;
$$;

revoke all on function public.ops_billing_stripe_webhook_errors_list(int) from public, anon;
grant execute on function public.ops_billing_stripe_webhook_errors_list(int) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Financeiro: remover grants diretos (RPC-first)
-- -----------------------------------------------------------------------------
revoke all on table public.financeiro_conciliacao_regras from authenticated, anon;
revoke all on table public.financeiro_contas_correntes from authenticated, anon;
revoke all on table public.financeiro_extratos_bancarios from authenticated, anon;
revoke all on table public.financeiro_meios_pagamento from authenticated, anon;
revoke all on table public.financeiro_movimentacoes from authenticated, anon;
revoke all on table public.financeiro_recorrencias from authenticated, anon;
revoke all on table public.financeiro_recorrencias_ocorrencias from authenticated, anon;
revoke all on table public.finops_usage_daily from authenticated, anon;
revoke all on table public.finance_jobs from authenticated, anon;
revoke all on table public.finance_job_dead_letters from authenticated, anon;

-- Ops tables lidas via RPCs acima (HealthPage)
revoke all on table public.ecommerce_job_dead_letters from authenticated, anon;
revoke all on table public.fiscal_nfe_webhook_events from authenticated, anon;
revoke all on table public.billing_stripe_webhook_events from authenticated, anon;

commit;

