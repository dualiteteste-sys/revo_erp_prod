/*
  RES-06 (P1) Circuit breaker + bulkheads (DB-side)

  Motivo:
  - Quando integrações externas (ex.: marketplace/NFE.io) ficam instáveis, falhas em cascata
    geram retrabalho, DLQ inflando e UX ruim. Um circuit breaker por empresa/domínio/provedor
    reduz impacto e dá "janelas" de recuperação.

  Impacto:
  - Cria tabela `public.integration_circuit_breakers` e 3 RPCs (service_role) para
    (a) consultar estado, (b) decidir se pode executar, (c) registrar sucesso/falha.

  Reversibilidade:
  - Seguro: remover apenas a tabela/funções (não altera schema existente).
*/

BEGIN;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Table: circuit breaker state per tenant+domain+provider
-- -----------------------------------------------------------------------------
create table if not exists public.integration_circuit_breakers (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  domain text not null,
  provider text not null,
  state text not null default 'closed',
  failure_count int not null default 0,
  opened_at timestamptz null,
  next_retry_at timestamptz null,
  last_failure_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_circuit_breakers_state_check check (state in ('closed','open','half_open')),
  constraint integration_circuit_breakers_unique unique (empresa_id, domain, provider)
);

alter table public.integration_circuit_breakers enable row level security;

drop trigger if exists tg_integration_circuit_breakers_updated_at on public.integration_circuit_breakers;
create trigger tg_integration_circuit_breakers_updated_at
before update on public.integration_circuit_breakers
for each row execute function public.tg_set_updated_at();

drop policy if exists integration_circuit_breakers_service_role on public.integration_circuit_breakers;
create policy integration_circuit_breakers_service_role
  on public.integration_circuit_breakers
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on table public.integration_circuit_breakers to service_role;

create index if not exists idx_integration_circuit_breakers_lookup
  on public.integration_circuit_breakers (empresa_id, domain, provider);

-- -----------------------------------------------------------------------------
-- RPC: current state (creates row if missing)
-- -----------------------------------------------------------------------------
create or replace function public.integration_circuit_breaker_state(
  p_empresa_id uuid,
  p_domain text,
  p_provider text
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  cb public.integration_circuit_breakers%rowtype;
begin
  insert into public.integration_circuit_breakers (empresa_id, domain, provider)
  values (p_empresa_id, p_domain, p_provider)
  on conflict (empresa_id, domain, provider) do nothing;

  select * into cb
  from public.integration_circuit_breakers
  where empresa_id = p_empresa_id and domain = p_domain and provider = p_provider;

  return jsonb_build_object(
    'empresa_id', cb.empresa_id,
    'domain', cb.domain,
    'provider', cb.provider,
    'state', cb.state,
    'failure_count', cb.failure_count,
    'opened_at', cb.opened_at,
    'next_retry_at', cb.next_retry_at,
    'last_failure_at', cb.last_failure_at,
    'last_error', cb.last_error
  );
end;
$$;

revoke all on function public.integration_circuit_breaker_state(uuid, text, text) from public;
grant execute on function public.integration_circuit_breaker_state(uuid, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- RPC: should allow execution?
-- - If OPEN and next_retry_at has passed -> transitions to HALF_OPEN and allows.
-- -----------------------------------------------------------------------------
create or replace function public.integration_circuit_breaker_should_allow(
  p_empresa_id uuid,
  p_domain text,
  p_provider text
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  cb public.integration_circuit_breakers%rowtype;
  now_ts timestamptz := now();
  allowed boolean := true;
begin
  insert into public.integration_circuit_breakers (empresa_id, domain, provider)
  values (p_empresa_id, p_domain, p_provider)
  on conflict (empresa_id, domain, provider) do nothing;

  select * into cb
  from public.integration_circuit_breakers
  where empresa_id = p_empresa_id and domain = p_domain and provider = p_provider
  for update;

  if cb.state = 'open' then
    if cb.next_retry_at is not null and cb.next_retry_at <= now_ts then
      update public.integration_circuit_breakers
      set state = 'half_open'
      where empresa_id = p_empresa_id and domain = p_domain and provider = p_provider;
      allowed := true;
      cb.state := 'half_open';
    else
      allowed := false;
    end if;
  end if;

  return jsonb_build_object(
    'allowed', allowed,
    'state', cb.state,
    'next_retry_at', cb.next_retry_at
  );
end;
$$;

revoke all on function public.integration_circuit_breaker_should_allow(uuid, text, text) from public;
grant execute on function public.integration_circuit_breaker_should_allow(uuid, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- RPC: record result
-- - On success: closes breaker and clears counters.
-- - On failure: increments counter; opens breaker after threshold.
-- -----------------------------------------------------------------------------
create or replace function public.integration_circuit_breaker_record_result(
  p_empresa_id uuid,
  p_domain text,
  p_provider text,
  p_ok boolean,
  p_error text default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  cb public.integration_circuit_breakers%rowtype;
  now_ts timestamptz := now();
  threshold int := 3;
  open_for interval := interval '10 minutes';
  new_failure_count int;
begin
  insert into public.integration_circuit_breakers (empresa_id, domain, provider)
  values (p_empresa_id, p_domain, p_provider)
  on conflict (empresa_id, domain, provider) do nothing;

  select * into cb
  from public.integration_circuit_breakers
  where empresa_id = p_empresa_id and domain = p_domain and provider = p_provider
  for update;

  if p_ok then
    update public.integration_circuit_breakers
    set state = 'closed',
        failure_count = 0,
        opened_at = null,
        next_retry_at = null,
        last_failure_at = null,
        last_error = null
    where empresa_id = p_empresa_id and domain = p_domain and provider = p_provider;

    return jsonb_build_object('state', 'closed', 'next_retry_at', null);
  end if;

  new_failure_count := cb.failure_count + 1;

  if cb.state <> 'open' and new_failure_count >= threshold then
    update public.integration_circuit_breakers
    set state = 'open',
        failure_count = 0,
        opened_at = now_ts,
        next_retry_at = now_ts + open_for,
        last_failure_at = now_ts,
        last_error = left(coalesce(p_error, 'FAIL'), 900)
    where empresa_id = p_empresa_id and domain = p_domain and provider = p_provider;

    return jsonb_build_object('state', 'open', 'next_retry_at', now_ts + open_for);
  end if;

  -- If already OPEN, just refresh last_error/last_failure_at (do not shorten next_retry_at).
  if cb.state = 'open' then
    update public.integration_circuit_breakers
    set last_failure_at = now_ts,
        last_error = left(coalesce(p_error, 'FAIL'), 900),
        next_retry_at = greatest(coalesce(next_retry_at, now_ts), now_ts + interval '1 minute')
    where empresa_id = p_empresa_id and domain = p_domain and provider = p_provider;

    select * into cb
    from public.integration_circuit_breakers
    where empresa_id = p_empresa_id and domain = p_domain and provider = p_provider;

    return jsonb_build_object('state', cb.state, 'next_retry_at', cb.next_retry_at);
  end if;

  update public.integration_circuit_breakers
  set failure_count = new_failure_count,
      last_failure_at = now_ts,
      last_error = left(coalesce(p_error, 'FAIL'), 900)
  where empresa_id = p_empresa_id and domain = p_domain and provider = p_provider;

  return jsonb_build_object('state', cb.state, 'next_retry_at', cb.next_retry_at, 'failure_count', new_failure_count);
end;
$$;

revoke all on function public.integration_circuit_breaker_record_result(uuid, text, text, boolean, text) from public;
grant execute on function public.integration_circuit_breaker_record_result(uuid, text, text, boolean, text) to service_role;

COMMIT;

