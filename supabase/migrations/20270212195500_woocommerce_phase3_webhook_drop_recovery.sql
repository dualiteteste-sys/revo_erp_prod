BEGIN;

ALTER TABLE public.woocommerce_webhook_event
  ADD COLUMN IF NOT EXISTS error_code text NULL;

ALTER TABLE public.woocommerce_webhook_event
  DROP CONSTRAINT IF EXISTS woocommerce_webhook_event_status_check;

ALTER TABLE public.woocommerce_webhook_event
  ADD CONSTRAINT woocommerce_webhook_event_status_check
  CHECK (process_status IN ('queued','done','error','dropped'));

CREATE INDEX IF NOT EXISTS idx_woocommerce_webhook_event_store_status_received
  ON public.woocommerce_webhook_event (store_id, process_status, received_at DESC);

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
