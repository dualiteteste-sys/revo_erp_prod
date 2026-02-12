/*
  WOOCOMMERCE-PHASE1-HARDENING

  Objetivos:
  - Claim robusto de jobs (inclui retries e lock por store/type)
  - Recuperacao de jobs "running" presos
  - Limpeza de retencao para webhook events
*/

BEGIN;

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
  WITH candidate AS (
    SELECT
      j.id,
      j.store_id,
      j.type,
      j.next_run_at,
      j.created_at,
      row_number() OVER (
        PARTITION BY j.store_id, j.type
        ORDER BY j.next_run_at ASC, j.created_at ASC
      ) AS rn
    FROM public.woocommerce_sync_job j
    JOIN public.integrations_woocommerce_store s
      ON s.id = j.store_id
     AND s.empresa_id = j.empresa_id
    WHERE (
      (j.status IN ('queued','error') AND j.next_run_at <= v_now)
      OR (j.status = 'running' AND (j.locked_at IS NULL OR j.locked_at <= (v_now - interval '10 minutes')))
    )
      AND s.status = 'active'
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
    FOR UPDATE OF j SKIP LOCKED
  ),
  picked AS (
    SELECT c.id
    FROM candidate c
    WHERE c.rn = 1
    ORDER BY c.next_run_at ASC, c.created_at ASC
    LIMIT GREATEST(1, COALESCE(p_limit, 5))
  ),
  upd AS (
    UPDATE public.woocommerce_sync_job j
    SET
      status = 'running',
      locked_at = v_now,
      lock_owner = nullif(trim(coalesce(p_lock_owner, '')), ''),
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

DROP FUNCTION IF EXISTS public.woocommerce_webhook_event_cleanup(uuid, int, int);
CREATE FUNCTION public.woocommerce_webhook_event_cleanup(
  p_store_id uuid DEFAULT NULL,
  p_keep_days int DEFAULT 14,
  p_limit int DEFAULT 200
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_keep_days int := GREATEST(1, COALESCE(p_keep_days, 14));
  v_limit int := GREATEST(1, COALESCE(p_limit, 200));
  v_deleted int := 0;
BEGIN
  WITH target AS (
    SELECT e.id
    FROM public.woocommerce_webhook_event e
    WHERE e.received_at < (now() - make_interval(days => v_keep_days))
      AND (p_store_id IS NULL OR e.store_id = p_store_id)
    ORDER BY e.received_at ASC
    LIMIT v_limit
  )
  DELETE FROM public.woocommerce_webhook_event e
  USING target t
  WHERE e.id = t.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.woocommerce_webhook_event_cleanup(uuid, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.woocommerce_webhook_event_cleanup(uuid, int, int) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
