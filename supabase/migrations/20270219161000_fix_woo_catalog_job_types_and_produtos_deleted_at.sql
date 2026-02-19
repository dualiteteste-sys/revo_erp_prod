BEGIN;

-- Sprint 2: garantir compatibilidade do catálogo Woo (jobs de run) em ambientes que ainda
-- estão com schema antigo e evitar falha "type inválido" ao enfileirar CATALOG_EXPORT/IMPORT.
-- Também adiciona suporte opcional a soft-delete em produtos para evitar erros em ambientes
-- que filtram por deleted_at.

-- 1) Produtos: coluna opcional de soft delete (não usada pelo catálogo Woo, mas evita falhas
-- em ambientes com queries legadas).
ALTER TABLE IF EXISTS public.produtos
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) Jobs: aceitar tipos de catálogo
ALTER TABLE public.woocommerce_sync_job
  DROP CONSTRAINT IF EXISTS woocommerce_sync_job_type_check;

ALTER TABLE public.woocommerce_sync_job
  ADD CONSTRAINT woocommerce_sync_job_type_check
  CHECK (type IN (
    'PRICE_SYNC',
    'STOCK_SYNC',
    'ORDER_RECONCILE',
    'CATALOG_RECONCILE',
    'CATALOG_EXPORT',
    'CATALOG_IMPORT'
  ));

-- 3) RPC enqueue: alinhar whitelist de tipos (evita "type inválido" em ambientes com versão anterior)
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
    next_run_at = LEAST(public.woocommerce_sync_job.next_run_at, EXCLUDED.next_run_at),
    updated_at = now()
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.woocommerce_sync_job_enqueue(uuid, text, jsonb, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.woocommerce_sync_job_enqueue(uuid, text, jsonb, text, timestamptz) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

