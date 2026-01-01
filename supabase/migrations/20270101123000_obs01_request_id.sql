/*
  OBS-01: Correlation ID (request_id) para Edge → logs/eventos

  Objetivo:
  - Persistir request_id em logs e eventos do provedor (NFE.io) e fila de webhooks
  - Facilitar troubleshooting ponta-a-ponta
*/

BEGIN;

alter table public.fiscal_nfe_provider_logs
  add column if not exists request_id text null;

alter table public.fiscal_nfe_provider_events
  add column if not exists request_id text null;

alter table public.fiscal_nfe_webhook_events
  add column if not exists request_id text null;

create index if not exists idx_fiscal_nfe_provider_logs_request_id
  on public.fiscal_nfe_provider_logs (request_id);

create index if not exists idx_fiscal_nfe_provider_events_request_id
  on public.fiscal_nfe_provider_events (request_id);

create index if not exists idx_fiscal_nfe_webhook_events_request_id
  on public.fiscal_nfe_webhook_events (request_id);

select pg_notify('pgrst', 'reload schema');

COMMIT;

