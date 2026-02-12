/*
  WOOCOMMERCE-STATE-OF-ART-01

  Objetivo
  - Implementar uma integração WooCommerce ↔ Revo ERP (multi-tenant) no estado da arte:
    - Múltiplas lojas por empresa (stores)
    - Webhooks idempotentes (dedupe por hash/delivery_id)
    - Jobs/queue com retry/backoff + dead-letter
    - Product map por SKU (simples + variações)
    - Base para importação de pedidos + sync de estoque/preço via worker (Edge Function)

  Segurança
  - Consumer Key/Secret e Webhook Secret são armazenados criptografados na tabela de store (ciphertext).
  - Nenhum segredo é exposto para usuários via RLS (somente metadados).
  - Webhook receiver sempre responde rápido; processamento é assíncrono via jobs.

  Observação
  - Criptografia/decriptação é feita no backend (Edge Functions) usando env `INTEGRATIONS_MASTER_KEY`.
  - Este migration cria apenas as estruturas + RPCs de fila (sem segredos no SQL).
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) Extensões e permissões (reusa RBAC existente: module=ecommerce)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Stores (múltiplas lojas Woo por empresa)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrations_woocommerce_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  base_url text NOT NULL,
  consumer_key_enc text NOT NULL,
  consumer_secret_enc text NOT NULL,
  webhook_secret_enc text NULL,
  auth_mode text NOT NULL DEFAULT 'basic_https',
  status text NOT NULL DEFAULT 'active',
  last_healthcheck_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integrations_woocommerce_store_auth_mode_check CHECK (auth_mode IN ('basic_https','oauth1','querystring_fallback')),
  CONSTRAINT integrations_woocommerce_store_status_check CHECK (status IN ('active','paused','error')),
  CONSTRAINT integrations_woocommerce_store_base_url_nonempty CHECK (length(trim(base_url)) > 0),
  CONSTRAINT integrations_woocommerce_store_unique_company_url UNIQUE (empresa_id, base_url)
);

ALTER TABLE public.integrations_woocommerce_store ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_integrations_woocommerce_store_updated_at ON public.integrations_woocommerce_store;
CREATE TRIGGER tg_integrations_woocommerce_store_updated_at
BEFORE UPDATE ON public.integrations_woocommerce_store
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP POLICY IF EXISTS integrations_woocommerce_store_select ON public.integrations_woocommerce_store;
CREATE POLICY integrations_woocommerce_store_select
  ON public.integrations_woocommerce_store
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS integrations_woocommerce_store_write_service_role ON public.integrations_woocommerce_store;
CREATE POLICY integrations_woocommerce_store_write_service_role
  ON public.integrations_woocommerce_store
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.integrations_woocommerce_store TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.integrations_woocommerce_store TO service_role;

CREATE INDEX IF NOT EXISTS idx_integrations_woocommerce_store_empresa
  ON public.integrations_woocommerce_store (empresa_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_integrations_woocommerce_store_status
  ON public.integrations_woocommerce_store (status, updated_at DESC);

-- -----------------------------------------------------------------------------
-- 2) Product map (SKU -> Woo IDs + Revo IDs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.woocommerce_product_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.integrations_woocommerce_store(id) ON DELETE CASCADE,
  revo_product_id uuid NULL,
  woo_product_id bigint NOT NULL,
  woo_variation_id bigint NOT NULL DEFAULT 0,
  sku text NOT NULL,
  last_synced_price_at timestamptz NULL,
  last_synced_stock_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT woocommerce_product_map_sku_nonempty CHECK (length(trim(sku)) > 0),
  CONSTRAINT woocommerce_product_map_unique UNIQUE (store_id, sku, woo_product_id, woo_variation_id)
);

ALTER TABLE public.woocommerce_product_map ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_woocommerce_product_map_updated_at ON public.woocommerce_product_map;
CREATE TRIGGER tg_woocommerce_product_map_updated_at
BEFORE UPDATE ON public.woocommerce_product_map
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP POLICY IF EXISTS woocommerce_product_map_select ON public.woocommerce_product_map;
CREATE POLICY woocommerce_product_map_select
  ON public.woocommerce_product_map
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS woocommerce_product_map_write_service_role ON public.woocommerce_product_map;
CREATE POLICY woocommerce_product_map_write_service_role
  ON public.woocommerce_product_map
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.woocommerce_product_map TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.woocommerce_product_map TO service_role;

CREATE INDEX IF NOT EXISTS idx_woocommerce_product_map_store_sku
  ON public.woocommerce_product_map (store_id, sku);

CREATE INDEX IF NOT EXISTS idx_woocommerce_product_map_store_revo_product
  ON public.woocommerce_product_map (store_id, revo_product_id);

-- -----------------------------------------------------------------------------
-- 3) Order map (Woo order -> Revo order)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.woocommerce_order_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.integrations_woocommerce_store(id) ON DELETE CASCADE,
  woo_order_id bigint NOT NULL,
  revo_order_id uuid NULL,
  woo_status text NULL,
  revo_status text NULL,
  woo_updated_at timestamptz NULL,
  imported_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT woocommerce_order_map_unique UNIQUE (store_id, woo_order_id)
);

ALTER TABLE public.woocommerce_order_map ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_woocommerce_order_map_updated_at ON public.woocommerce_order_map;
CREATE TRIGGER tg_woocommerce_order_map_updated_at
BEFORE UPDATE ON public.woocommerce_order_map
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP POLICY IF EXISTS woocommerce_order_map_select ON public.woocommerce_order_map;
CREATE POLICY woocommerce_order_map_select
  ON public.woocommerce_order_map
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS woocommerce_order_map_write_service_role ON public.woocommerce_order_map;
CREATE POLICY woocommerce_order_map_write_service_role
  ON public.woocommerce_order_map
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.woocommerce_order_map TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.woocommerce_order_map TO service_role;

CREATE INDEX IF NOT EXISTS idx_woocommerce_order_map_store_updated
  ON public.woocommerce_order_map (store_id, woo_updated_at DESC NULLS LAST);

-- -----------------------------------------------------------------------------
-- 4) Webhook event (dedupe + auditoria)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.woocommerce_webhook_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.integrations_woocommerce_store(id) ON DELETE CASCADE,
  topic text NOT NULL,
  woo_resource_id bigint NOT NULL,
  delivery_id text NULL,
  payload_hash text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  process_status text NOT NULL DEFAULT 'queued',
  last_error text NULL,
  CONSTRAINT woocommerce_webhook_event_status_check CHECK (process_status IN ('queued','done','error'))
);

ALTER TABLE public.woocommerce_webhook_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS woocommerce_webhook_event_select ON public.woocommerce_webhook_event;
CREATE POLICY woocommerce_webhook_event_select
  ON public.woocommerce_webhook_event
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS woocommerce_webhook_event_write_service_role ON public.woocommerce_webhook_event;
CREATE POLICY woocommerce_webhook_event_write_service_role
  ON public.woocommerce_webhook_event
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.woocommerce_webhook_event TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.woocommerce_webhook_event TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS woocommerce_webhook_event_dedupe_delivery
  ON public.woocommerce_webhook_event (store_id, delivery_id)
  WHERE delivery_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS woocommerce_webhook_event_dedupe_hash
  ON public.woocommerce_webhook_event (store_id, topic, woo_resource_id, payload_hash);

CREATE INDEX IF NOT EXISTS idx_woocommerce_webhook_event_store_received
  ON public.woocommerce_webhook_event (store_id, received_at DESC);

-- -----------------------------------------------------------------------------
-- 5) Sync jobs (queue DB-backed) + logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.woocommerce_sync_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.integrations_woocommerce_store(id) ON DELETE CASCADE,
  type text NOT NULL,
  dedupe_key text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 10,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz NULL,
  lock_owner text NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT woocommerce_sync_job_status_check CHECK (status IN ('queued','running','done','error','dead')),
  CONSTRAINT woocommerce_sync_job_type_check CHECK (type IN ('PRICE_SYNC','STOCK_SYNC','ORDER_RECONCILE','CATALOG_RECONCILE')),
  CONSTRAINT woocommerce_sync_job_dedupe_unique UNIQUE (store_id, type, dedupe_key)
);

ALTER TABLE public.woocommerce_sync_job ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_woocommerce_sync_job_updated_at ON public.woocommerce_sync_job;
CREATE TRIGGER tg_woocommerce_sync_job_updated_at
BEFORE UPDATE ON public.woocommerce_sync_job
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP POLICY IF EXISTS woocommerce_sync_job_select ON public.woocommerce_sync_job;
CREATE POLICY woocommerce_sync_job_select
  ON public.woocommerce_sync_job
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS woocommerce_sync_job_write_service_role ON public.woocommerce_sync_job;
CREATE POLICY woocommerce_sync_job_write_service_role
  ON public.woocommerce_sync_job
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.woocommerce_sync_job TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.woocommerce_sync_job TO service_role;

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_job_pending
  ON public.woocommerce_sync_job (status, next_run_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_job_store_type
  ON public.woocommerce_sync_job (store_id, type, status, next_run_at);

CREATE TABLE IF NOT EXISTS public.woocommerce_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.integrations_woocommerce_store(id) ON DELETE CASCADE,
  job_id uuid NULL REFERENCES public.woocommerce_sync_job(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT woocommerce_sync_log_level_check CHECK (level IN ('debug','info','warn','error'))
);

ALTER TABLE public.woocommerce_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS woocommerce_sync_log_select ON public.woocommerce_sync_log;
CREATE POLICY woocommerce_sync_log_select
  ON public.woocommerce_sync_log
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS woocommerce_sync_log_write_service_role ON public.woocommerce_sync_log;
CREATE POLICY woocommerce_sync_log_write_service_role
  ON public.woocommerce_sync_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.woocommerce_sync_log TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.woocommerce_sync_log TO service_role;

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_log_store_created
  ON public.woocommerce_sync_log (store_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 6) RPCs de enqueue/list e RPCs service_role de claim/ack
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.woocommerce_stores_list();
CREATE FUNCTION public.woocommerce_stores_list()
RETURNS TABLE(
  id uuid,
  base_url text,
  auth_mode text,
  status text,
  last_healthcheck_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','view');
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.base_url, s.auth_mode, s.status, s.last_healthcheck_at, s.created_at, s.updated_at
  FROM public.integrations_woocommerce_store s
  WHERE s.empresa_id = v_empresa
  ORDER BY s.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.woocommerce_stores_list() FROM public;
GRANT EXECUTE ON FUNCTION public.woocommerce_stores_list() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.woocommerce_sync_job_enqueue(uuid, text, jsonb, text, timestamptz);
CREATE FUNCTION public.woocommerce_sync_job_enqueue(
  p_store_id uuid,
  p_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_dedupe_key text DEFAULT NULL,
  p_next_run_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_job_id uuid;
  v_type text := upper(trim(coalesce(p_type,'')));
  v_dedupe text := nullif(trim(coalesce(p_dedupe_key,'')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_run_at timestamptz := coalesce(p_next_run_at, now());
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'store_id inválido' USING errcode = '22023';
  END IF;
  IF v_type NOT IN ('PRICE_SYNC','STOCK_SYNC','ORDER_RECONCILE','CATALOG_RECONCILE') THEN
    RAISE EXCEPTION 'type inválido' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.integrations_woocommerce_store s
    WHERE s.id = p_store_id
      AND s.empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Store não encontrada' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.woocommerce_sync_job (
    empresa_id, store_id, type, dedupe_key, payload, status, next_run_at
  )
  VALUES (
    v_empresa, p_store_id, v_type, v_dedupe, v_payload, 'queued', v_run_at
  )
  ON CONFLICT (store_id, type, dedupe_key)
  WHERE v_dedupe IS NOT NULL
  DO UPDATE SET
    payload = CASE
      WHEN v_type IN ('PRICE_SYNC','STOCK_SYNC')
        AND (public.woocommerce_sync_job.payload ? 'skus')
        AND (EXCLUDED.payload ? 'skus')
      THEN jsonb_set(
        public.woocommerce_sync_job.payload,
        '{skus}',
        (
          SELECT jsonb_agg(DISTINCT v)
          FROM (
            SELECT jsonb_array_elements_text(public.woocommerce_sync_job.payload->'skus') AS v
            UNION ALL
            SELECT jsonb_array_elements_text(EXCLUDED.payload->'skus') AS v
          ) t
        ),
        true
      )
      ELSE EXCLUDED.payload
    END,
    status = CASE WHEN public.woocommerce_sync_job.status IN ('done','error','dead') THEN 'queued' ELSE public.woocommerce_sync_job.status END,
    next_run_at = LEAST(public.woocommerce_sync_job.next_run_at, EXCLUDED.next_run_at),
    updated_at = now()
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.woocommerce_sync_job_enqueue(uuid, text, jsonb, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.woocommerce_sync_job_enqueue(uuid, text, jsonb, text, timestamptz) TO authenticated, service_role;

-- Claim/ack: somente service_role (worker)
DROP FUNCTION IF EXISTS public.woocommerce_sync_jobs_claim(int, uuid, text);
CREATE FUNCTION public.woocommerce_sync_jobs_claim(
  p_limit int DEFAULT 5,
  p_store_id uuid DEFAULT NULL,
  p_lock_owner text DEFAULT 'woocommerce-worker'
)
RETURNS SETOF public.woocommerce_sync_job
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.woocommerce_sync_job j
    WHERE j.status = 'queued'
      AND j.next_run_at <= v_now
      AND (p_store_id IS NULL OR j.store_id = p_store_id)
    ORDER BY j.next_run_at ASC, j.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, COALESCE(p_limit, 5))
  ),
  upd AS (
    UPDATE public.woocommerce_sync_job j
    SET
      status = 'running',
      locked_at = v_now,
      lock_owner = nullif(trim(coalesce(p_lock_owner,'')), ''),
      attempts = j.attempts + 1,
      updated_at = v_now
    FROM picked p
    WHERE j.id = p.id
    RETURNING j.*
  )
  SELECT * FROM upd;
END;
$$;

REVOKE ALL ON FUNCTION public.woocommerce_sync_jobs_claim(int, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.woocommerce_sync_jobs_claim(int, uuid, text) TO service_role;

DROP FUNCTION IF EXISTS public.woocommerce_sync_job_complete(uuid, boolean, text, timestamptz);
CREATE FUNCTION public.woocommerce_sync_job_complete(
  p_job_id uuid,
  p_ok boolean,
  p_error text DEFAULT NULL,
  p_next_run_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := now();
  v_err text := nullif(trim(coalesce(p_error,'')), '');
  v_next timestamptz := coalesce(p_next_run_at, (v_now + interval '5 minutes'));
BEGIN
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'job_id inválido' USING errcode = '22023';
  END IF;

  IF p_ok THEN
    UPDATE public.woocommerce_sync_job
    SET
      status = 'done',
      locked_at = NULL,
      lock_owner = NULL,
      last_error = NULL,
      next_run_at = v_now,
      updated_at = v_now
    WHERE id = p_job_id;
    RETURN;
  END IF;

  UPDATE public.woocommerce_sync_job
  SET
    status = CASE
      WHEN attempts >= max_attempts THEN 'dead'
      ELSE 'error'
    END,
    locked_at = NULL,
    lock_owner = NULL,
    last_error = v_err,
    next_run_at = CASE
      WHEN attempts >= max_attempts THEN v_now
      ELSE v_next
    END,
    updated_at = v_now
  WHERE id = p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.woocommerce_sync_job_complete(uuid, boolean, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.woocommerce_sync_job_complete(uuid, boolean, text, timestamptz) TO service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;
