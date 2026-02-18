/*
  Fix: woocommerce_sync_jobs_claim (again)

  Problema (prod): "FOR UPDATE is not allowed with DISTINCT clause"
  A versão anterior aplicava FOR UPDATE no mesmo SELECT que usava DISTINCT ON.

  Solução (Postgres-safe):
  - Primeiro "travar" (FOR UPDATE SKIP LOCKED) um conjunto limitado de linhas elegíveis em um CTE MATERIALIZED.
  - Depois aplicar DISTINCT ON no resultado já travado (sem FOR UPDATE) para escolher 1 job por (store_id, type).
  - Por fim, atualizar somente os IDs escolhidos para status=running.
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

COMMIT;

