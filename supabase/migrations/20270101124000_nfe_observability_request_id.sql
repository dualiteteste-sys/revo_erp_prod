/*
  OBS-01: Incluir request_id na timeline fiscal (view)
*/

BEGIN;

create or replace view public.fiscal_nfe_audit_timeline
with (security_invoker = true, security_barrier = true)
as
select
  h.empresa_id,
  h.emissao_id,
  'status'::text as kind,
  h.changed_at as occurred_at,
  case
    when coalesce(h.old_status, '') <> coalesce(h.new_status, '') then
      concat('Status: ', coalesce(h.old_status, '—'), ' → ', coalesce(h.new_status, '—'))
    else
      'Erro atualizado'
  end as message,
  jsonb_build_object(
    'old_status', h.old_status,
    'new_status', h.new_status,
    'old_error', nullif(h.old_error, ''),
    'new_error', nullif(h.new_error, ''),
    'changed_by', h.changed_by
  ) as payload,
  'db'::text as source
from public.fiscal_nfe_status_history h

union all

select
  e.empresa_id,
  e.emissao_id,
  'provider_event'::text as kind,
  e.created_at as occurred_at,
  concat('NFE.io ', e.event_type, ' — ', e.status) as message,
  jsonb_build_object(
    'event_type', e.event_type,
    'status', e.status,
    'http_status', e.http_status,
    'error_message', e.error_message,
    'request_id', e.request_id,
    'request', e.request_payload,
    'response', e.response_payload
  ) as payload,
  'edge'::text as source
from public.fiscal_nfe_provider_events e

union all

select
  l.empresa_id,
  l.emissao_id,
  'provider_log'::text as kind,
  l.created_at as occurred_at,
  concat('LOG ', l.level, ' — ', l.message) as message,
  jsonb_build_object('request_id', l.request_id, 'payload', l.payload) as payload,
  'edge'::text as source
from public.fiscal_nfe_provider_logs l

union all

select
  w.empresa_id,
  (select fe.emissao_id from public.fiscal_nfe_nfeio_emissoes fe where fe.nfeio_id = w.nfeio_id limit 1) as emissao_id,
  'webhook'::text as kind,
  w.received_at as occurred_at,
  concat('Webhook ', coalesce(w.event_type, 'event')) as message,
  jsonb_build_object(
    'event_type', w.event_type,
    'nfeio_id', w.nfeio_id,
    'request_id', w.request_id,
    'attempts', w.process_attempts,
    'next_retry_at', w.next_retry_at,
    'last_error', w.last_error,
    'payload', w.payload
  ) as payload,
  'nfeio'::text as source
from public.fiscal_nfe_webhook_events w;

select pg_notify('pgrst', 'reload schema');

COMMIT;

