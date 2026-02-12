/*
  ECOMMERCE-MULTIIMPORT-01 (PR1 base)

  Objetivo:
  - Estruturar base de importações múltiplas assíncronas para e-commerce.
  - Expor RPCs para enfileirar, listar, detalhar, cancelar e reprocessar jobs.
  - Expor RPC de claim para workers processarem lotes em paralelo com segurança.

  Escopo:
  - Nova tabela: public.ecommerce_job_items (resultado por item/linha de importação).
  - Ajuste de status em public.ecommerce_jobs: inclui "canceled".
  - RPCs:
    - public.ecommerce_import_job_enqueue(...)
    - public.ecommerce_import_jobs_list(...)
    - public.ecommerce_import_job_get(...)
    - public.ecommerce_import_job_cancel(...)
    - public.ecommerce_import_job_retry_failed(...)
    - public.ecommerce_import_jobs_claim(...)

  Segurança:
  - RPC-first com require_permission_for_current_user para chamadas de UI.
  - SECURITY DEFINER + search_path fixo.
  - isolamento por empresa_id em todas as consultas.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Status de jobs: incluir "canceled"
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ecommerce_jobs
  DROP CONSTRAINT IF EXISTS ecommerce_jobs_status_check;

ALTER TABLE public.ecommerce_jobs
  ADD CONSTRAINT ecommerce_jobs_status_check
  CHECK (status IN ('pending','processing','done','error','dead','canceled'));

-- -----------------------------------------------------------------------------
-- 2) Itemização de resultados por job (auditoria por linha)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ecommerce_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.ecommerce_jobs(id) ON DELETE CASCADE,
  run_id uuid NULL REFERENCES public.ecommerce_job_runs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  kind text NOT NULL,
  external_id text NULL,
  sku text NULL,
  action text NOT NULL DEFAULT 'skipped',
  status text NOT NULL DEFAULT 'skipped',
  message text NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecommerce_job_items_action_check CHECK (action IN ('created','updated','skipped','failed')),
  CONSTRAINT ecommerce_job_items_status_check CHECK (status IN ('created','updated','skipped','failed'))
);

ALTER TABLE public.ecommerce_job_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ecommerce_job_items_select ON public.ecommerce_job_items;
CREATE POLICY ecommerce_job_items_select
  ON public.ecommerce_job_items
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS ecommerce_job_items_write_service_role ON public.ecommerce_job_items;
CREATE POLICY ecommerce_job_items_write_service_role
  ON public.ecommerce_job_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.ecommerce_job_items TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.ecommerce_job_items TO service_role;

CREATE INDEX IF NOT EXISTS idx_ecommerce_job_items_empresa_created
  ON public.ecommerce_job_items (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ecommerce_job_items_job
  ON public.ecommerce_job_items (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ecommerce_job_items_run
  ON public.ecommerce_job_items (run_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3) Enfileirar importação (UI -> queue)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_import_job_enqueue(text, text, jsonb, text, timestamptz, int);
CREATE FUNCTION public.ecommerce_import_job_enqueue(
  p_provider text,
  p_kind text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_max_attempts int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_now timestamptz := now();
  v_connection_id uuid;
  v_dedupe_key text;
  v_job public.ecommerce_jobs%rowtype;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_provider NOT IN ('meli','shopee') THEN
    RAISE EXCEPTION 'provider inválido' USING errcode = '22023';
  END IF;
  IF p_kind NOT IN ('import_orders','import_products','sync_stock','sync_prices') THEN
    RAISE EXCEPTION 'kind inválido' USING errcode = '22023';
  END IF;

  SELECT e.id
    INTO v_connection_id
  FROM public.ecommerces e
  WHERE e.empresa_id = v_empresa
    AND e.provider = p_provider
    AND COALESCE(e.status, 'disconnected') <> 'disconnected'
  ORDER BY e.updated_at DESC
  LIMIT 1;

  IF v_connection_id IS NULL THEN
    RAISE EXCEPTION 'Conexão ativa não encontrada para o provider informado' USING errcode = 'P0002';
  END IF;

  v_dedupe_key := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
  IF v_dedupe_key IS NOT NULL THEN
    v_dedupe_key := format('%s|%s|%s', v_empresa::text, p_provider, v_dedupe_key);
  END IF;

  INSERT INTO public.ecommerce_jobs (
    empresa_id,
    ecommerce_id,
    provider,
    kind,
    dedupe_key,
    payload,
    status,
    scheduled_for,
    next_retry_at,
    attempts,
    max_attempts,
    created_by
  )
  VALUES (
    v_empresa,
    v_connection_id,
    p_provider,
    p_kind,
    v_dedupe_key,
    COALESCE(p_payload, '{}'::jsonb),
    'pending',
    p_scheduled_for,
    COALESCE(p_scheduled_for, v_now),
    0,
    GREATEST(1, COALESCE(p_max_attempts, 10)),
    auth.uid()
  )
  ON CONFLICT (provider, dedupe_key)
  WHERE dedupe_key IS NOT NULL
  DO UPDATE
    SET payload = EXCLUDED.payload,
        scheduled_for = EXCLUDED.scheduled_for,
        next_retry_at = EXCLUDED.next_retry_at,
        updated_at = now()
  RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'provider', v_job.provider,
    'kind', v_job.kind,
    'status', v_job.status,
    'scheduled_for', v_job.scheduled_for,
    'created_at', v_job.created_at,
    'dedupe_key', v_job.dedupe_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_import_job_enqueue(text, text, jsonb, text, timestamptz, int) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_import_job_enqueue(text, text, jsonb, text, timestamptz, int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Listagem de jobs (UI)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_import_jobs_list(text, text, text, int, int);
CREATE FUNCTION public.ecommerce_import_jobs_list(
  p_provider text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  provider text,
  kind text,
  status text,
  attempts int,
  max_attempts int,
  scheduled_for timestamptz,
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz,
  items_total bigint,
  items_failed bigint
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
  SELECT
    j.id,
    j.provider,
    j.kind,
    j.status,
    j.attempts,
    j.max_attempts,
    j.scheduled_for,
    j.next_retry_at,
    j.last_error,
    j.created_at,
    j.updated_at,
    COALESCE(ji.items_total, 0) AS items_total,
    COALESCE(ji.items_failed, 0) AS items_failed
  FROM public.ecommerce_jobs j
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS items_total,
      COUNT(*) FILTER (WHERE i.status = 'failed')::bigint AS items_failed
    FROM public.ecommerce_job_items i
    WHERE i.job_id = j.id
  ) ji ON TRUE
  WHERE j.empresa_id = v_empresa
    AND (p_provider IS NULL OR j.provider = p_provider)
    AND (p_kind IS NULL OR j.kind = p_kind)
    AND (p_status IS NULL OR j.status = p_status)
  ORDER BY j.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_import_jobs_list(text, text, text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_import_jobs_list(text, text, text, int, int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Detalhe de job (UI)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_import_job_get(uuid, int, int);
CREATE FUNCTION public.ecommerce_import_job_get(
  p_job_id uuid,
  p_runs_limit int DEFAULT 20,
  p_items_limit int DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_job public.ecommerce_jobs%rowtype;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','view');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  SELECT *
    INTO v_job
  FROM public.ecommerce_jobs j
  WHERE j.id = p_job_id
    AND j.empresa_id = v_empresa
  LIMIT 1;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job não encontrado' USING errcode = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'job', to_jsonb(v_job),
    'runs', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC)
      FROM (
        SELECT
          run.id,
          run.started_at,
          run.finished_at,
          run.ok,
          run.error,
          run.meta
        FROM public.ecommerce_job_runs run
        WHERE run.empresa_id = v_empresa
          AND run.job_id = v_job.id
        ORDER BY run.started_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_runs_limit, 20), 1), 200)
      ) r
    ), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC)
      FROM (
        SELECT
          item.id,
          item.run_id,
          item.external_id,
          item.sku,
          item.action,
          item.status,
          item.message,
          item.context,
          item.created_at
        FROM public.ecommerce_job_items item
        WHERE item.empresa_id = v_empresa
          AND item.job_id = v_job.id
        ORDER BY item.created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_items_limit, 200), 1), 500)
      ) i
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_import_job_get(uuid, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_import_job_get(uuid, int, int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6) Cancelar job (UI)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_import_job_cancel(uuid);
CREATE FUNCTION public.ecommerce_import_job_cancel(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_job_id uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  UPDATE public.ecommerce_jobs j
  SET status = 'canceled',
      last_error = 'cancelled_by_user',
      updated_at = now()
  WHERE j.id = p_job_id
    AND j.empresa_id = v_empresa
    AND j.status IN ('pending','processing')
  RETURNING j.id INTO v_job_id;

  RETURN v_job_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_import_job_cancel(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_import_job_cancel(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7) Reprocessar job com falha (UI)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_import_job_retry_failed(uuid, text);
CREATE FUNCTION public.ecommerce_import_job_retry_failed(
  p_job_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_job public.ecommerce_jobs%rowtype;
  v_new_job public.ecommerce_jobs%rowtype;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  SELECT *
    INTO v_job
  FROM public.ecommerce_jobs j
  WHERE j.id = p_job_id
    AND j.empresa_id = v_empresa
  LIMIT 1;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job não encontrado' USING errcode = 'P0002';
  END IF;

  IF v_job.status NOT IN ('error','dead','canceled') THEN
    RAISE EXCEPTION 'Somente jobs com falha/cancelados podem ser reprocessados' USING errcode = '22023';
  END IF;

  INSERT INTO public.ecommerce_jobs (
    empresa_id,
    ecommerce_id,
    provider,
    kind,
    dedupe_key,
    payload,
    status,
    scheduled_for,
    next_retry_at,
    attempts,
    max_attempts,
    created_by
  )
  VALUES (
    v_job.empresa_id,
    v_job.ecommerce_id,
    v_job.provider,
    v_job.kind,
    NULL,
    COALESCE(v_job.payload, '{}'::jsonb)
      || jsonb_build_object('retry_of_job_id', v_job.id, 'retry_reason', COALESCE(v_reason, 'manual_retry')),
    'pending',
    now(),
    now(),
    0,
    v_job.max_attempts,
    auth.uid()
  )
  RETURNING * INTO v_new_job;

  RETURN jsonb_build_object(
    'source_job_id', v_job.id,
    'new_job_id', v_new_job.id,
    'status', v_new_job.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_import_job_retry_failed(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_import_job_retry_failed(uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8) Claim de jobs para worker (service_role)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_import_jobs_claim(text, int, text);
CREATE FUNCTION public.ecommerce_import_jobs_claim(
  p_provider text,
  p_limit int DEFAULT 20,
  p_worker text DEFAULT NULL
)
RETURNS SETOF public.ecommerce_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_worker text := COALESCE(NULLIF(trim(COALESCE(p_worker, '')), ''), 'worker');
BEGIN
  IF p_provider NOT IN ('meli','shopee') THEN
    RAISE EXCEPTION 'provider inválido' USING errcode = '22023';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.ecommerce_jobs j
    WHERE j.provider = p_provider
      AND j.status = 'pending'
      AND COALESCE(j.next_retry_at, now()) <= now()
      AND COALESCE(j.scheduled_for, now()) <= now()
    ORDER BY j.created_at ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200)
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.ecommerce_jobs j
    SET status = 'processing',
        attempts = j.attempts + 1,
        locked_at = now(),
        locked_by = v_worker,
        updated_at = now()
    FROM picked p
    WHERE j.id = p.id
    RETURNING j.*
  )
  SELECT * FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_import_jobs_claim(text, int, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ecommerce_import_jobs_claim(text, int, text) TO service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;
