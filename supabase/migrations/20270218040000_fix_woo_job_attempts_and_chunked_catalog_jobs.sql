/*
  Fix: Woo worker scheduler 504 timeouts + better retry semantics.

  Problem:
  - woocommerce-scheduler (GitHub cron) can 504 when woocommerce-worker runs long jobs (e.g. catalog export/import).
  - attempts was incremented on CLAIM, which makes any chunked/resumed processing hit max_attempts quickly.

  Changes:
  1) woocommerce_sync_jobs_claim: stop incrementing attempts on claim (attempts = processing failure counter, not claim counter).
  2) woocommerce_sync_job_complete: increment attempts on failure and use (attempts + 1) for dead-letter decision.

  Notes:
  - Idempotent via CREATE OR REPLACE.
  - Keeps compatibility of signatures and existing callers.
*/

BEGIN;

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
    ORDER BY j.next_run_at ASC, j.created_at ASC
    FOR UPDATE OF j SKIP LOCKED
    LIMIT GREATEST(50, v_limit * 20)
  ),
  candidate AS (
    SELECT DISTINCT ON (l.store_id, l.type)
      l.id,
      l.next_run_at,
      l.created_at
    FROM locked l
    ORDER BY l.store_id, l.type, l.next_run_at ASC, l.created_at ASC
  ),
  picked AS (
    SELECT c.id
    FROM candidate c
    ORDER BY c.next_run_at ASC, c.created_at ASC
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

CREATE OR REPLACE FUNCTION public.woocommerce_sync_job_complete(
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
    attempts = attempts + 1,
    status = CASE
      WHEN (attempts + 1) >= max_attempts THEN 'dead'
      ELSE 'error'
    END,
    locked_at = NULL,
    lock_owner = NULL,
    last_error = v_err,
    next_run_at = CASE
      WHEN (attempts + 1) >= max_attempts THEN v_now
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

