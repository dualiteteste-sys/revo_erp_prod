/*
  NFE-06: Webhooks + fila/retry idempotente (NFE.io)

  Objetivo:
  - Receber eventos via webhook (rápido, idempotente)
  - Persistir payload + headers para auditoria
  - Processar em background via worker (retry com backoff)
*/

BEGIN;

create extension if not exists pgcrypto;

create table if not exists public.fiscal_nfe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid null references public.empresas(id) on delete set null,
  provider text not null default 'nfeio',
  event_type text null,
  nfeio_id text null,
  dedupe_key text not null,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  process_attempts int not null default 0,
  next_retry_at timestamptz null,
  locked_at timestamptz null,
  locked_by text null,
  last_error text null,
  constraint fiscal_nfe_webhook_events_dedupe_unique unique (provider, dedupe_key)
);

alter table public.fiscal_nfe_webhook_events enable row level security;

drop policy if exists fiscal_nfe_webhook_events_select on public.fiscal_nfe_webhook_events;
create policy fiscal_nfe_webhook_events_select
  on public.fiscal_nfe_webhook_events
  for select
  to authenticated
  using (
    empresa_id is null
    or empresa_id = public.current_empresa_id()
  );

drop policy if exists fiscal_nfe_webhook_events_write_service_role on public.fiscal_nfe_webhook_events;
create policy fiscal_nfe_webhook_events_write_service_role
  on public.fiscal_nfe_webhook_events
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.fiscal_nfe_webhook_events to authenticated, service_role;
grant insert, update, delete on table public.fiscal_nfe_webhook_events to service_role;

create index if not exists idx_fiscal_nfe_webhook_events_pending
  on public.fiscal_nfe_webhook_events (provider, processed_at, next_retry_at, received_at desc);

create index if not exists idx_fiscal_nfe_webhook_events_nfeio
  on public.fiscal_nfe_webhook_events (provider, nfeio_id, received_at desc);

select pg_notify('pgrst', 'reload schema');

COMMIT;

