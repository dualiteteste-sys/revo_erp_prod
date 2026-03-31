/*
  MELI-HARDENING-PHASE3

  Fase 3 do hardening da integração Mercado Livre:
  - Webhook deduplication: unique partial index em notification_id
  - Webhook audit: payload_hash + signature_valid
  - Rate-limit support: index em (ecommerce_id, received_at)
  - Dead-letter traceability: job_id FK nullable
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. meli_webhook_events: colunas de auditoria
-- ---------------------------------------------------------------------------
ALTER TABLE public.meli_webhook_events
  ADD COLUMN IF NOT EXISTS payload_hash text;

ALTER TABLE public.meli_webhook_events
  ADD COLUMN IF NOT EXISTS signature_valid boolean DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 2. Unique partial index para dedup de notification_id (ML retries)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_meli_webhook_events_notification_id_unique
  ON public.meli_webhook_events (empresa_id, ecommerce_id, notification_id)
  WHERE notification_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Index para rate-limit query (count por minuto por ecommerce)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_meli_webhook_events_ecommerce_received
  ON public.meli_webhook_events (ecommerce_id, received_at DESC);

-- ---------------------------------------------------------------------------
-- 4. ecommerce_job_dead_letters: nullable job_id FK para traceabilidade
-- ---------------------------------------------------------------------------
ALTER TABLE public.ecommerce_job_dead_letters
  ADD COLUMN IF NOT EXISTS job_id uuid NULL
    REFERENCES public.ecommerce_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ecommerce_job_dead_letters_job_id
  ON public.ecommerce_job_dead_letters (job_id)
  WHERE job_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
