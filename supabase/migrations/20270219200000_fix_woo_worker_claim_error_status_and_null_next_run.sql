/*
  Fix: Woo catalog runs stuck in QUEUED (jobs never claimed)

  Root causes addressed:
  1) `woocommerce_sync_jobs_claim` required `integrations_woocommerce_store.status = 'active'`.
     A store can be temporarily marked as `error` (transient healthcheck failure), which should NOT stop the queue.
  2) Some rows can end up with `woocommerce_sync_job.next_run_at IS NULL` (legacy drift or older buggy enqueue).
     `woocommerce_sync_jobs_claim` uses `next_run_at <= now()`, so NULL jobs never run.
  3) `woocommerce_sync_job_enqueue` used `LEAST(existing.next_run_at, excluded.next_run_at)` which returns NULL if
     existing.next_run_at is NULL, making the job permanently unrunnable.

  This migration:
  - Backfills NULL next_run_at to now() for queued/error jobs.
  - Allows claim/processing for store status in ('active','error') (paused remains blocked).
  - Hardens claim predicate/order with COALESCE(next_run_at, now()).
  - Hardens enqueue ON CONFLICT next_run_at update to not propagate NULL.
*/

BEGIN;

-- 0) Backfill: make legacy NULL jobs runnable (safe + idempotent)
UPDATE public.woocommerce_sync_job
SET
  next_run_at = now(),
  updated_at = now()
WHERE next_run_at IS NULL
  AND status IN ('queued','error');

-- 1) Claim: allow transient store status=error + treat NULL next_run_at as runnable now()
CREATE OR REPLACE FUNCTION public.woocommerce_sync_jobs_claim(
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
  v_limit int := GREATEST(1, COALESCE(p_limit, 5));
BEGIN
  RETURN QUERY
  WITH locked AS MATERIALIZED (
    SELECT
      j.id,
      j.store_id,
      j.type,
      j.next_run_at,
      j.created_at
    FROM public.woocommerce_sync_job j
    JOIN public.integrations_woocommerce_store s
      ON s.id = j.store_id
     AND s.empresa_id = j.empresa_id
    WHERE (
      (j.status IN ('queued','error') AND COALESCE(j.next_run_at, v_now) <= v_now)
      OR (j.status = 'running' AND (j.locked_at IS NULL OR j.locked_at <= (v_now - interval '10 minutes')))
    )
      AND s.status IN ('active','error')
      AND (p_store_id IS NULL OR j.store_id = p_store_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.woocommerce_sync_job lockj
        WHERE lockj.store_id = j.store_id
          AND lockj.type = j.type
          AND lockj.status = 'running'
          AND lockj.id <> j.id
          AND lockj.locked_at >= (v_now - interval '10 minutes')
      )
    ORDER BY COALESCE(j.next_run_at, v_now) ASC, j.created_at ASC
    FOR UPDATE OF j SKIP LOCKED
    LIMIT GREATEST(50, v_limit * 20)
  ),
  candidate AS (
    SELECT DISTINCT ON (l.store_id, l.type)
      l.id,
      l.next_run_at,
      l.created_at
    FROM locked l
    ORDER BY l.store_id, l.type, COALESCE(l.next_run_at, v_now) ASC, l.created_at ASC
  ),
  picked AS (
    SELECT c.id
    FROM candidate c
    ORDER BY COALESCE(c.next_run_at, v_now) ASC, c.created_at ASC
    LIMIT v_limit
  ),
  upd AS (
    UPDATE public.woocommerce_sync_job j
    SET
      status = 'running',
      locked_at = v_now,
      lock_owner = nullif(trim(coalesce(p_lock_owner, '')), ''),
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

-- 2) Enqueue: never propagate NULL next_run_at across dedupe merges
CREATE OR REPLACE FUNCTION public.woocommerce_sync_job_enqueue(
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
  IF v_type NOT IN (
    'PRICE_SYNC',
    'STOCK_SYNC',
    'ORDER_RECONCILE',
    'CATALOG_RECONCILE',
    'CATALOG_EXPORT',
    'CATALOG_IMPORT'
  ) THEN
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
    next_run_at = LEAST(COALESCE(public.woocommerce_sync_job.next_run_at, EXCLUDED.next_run_at), EXCLUDED.next_run_at),
    updated_at = now()
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.woocommerce_sync_job_enqueue(uuid, text, jsonb, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.woocommerce_sync_job_enqueue(uuid, text, jsonb, text, timestamptz) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

