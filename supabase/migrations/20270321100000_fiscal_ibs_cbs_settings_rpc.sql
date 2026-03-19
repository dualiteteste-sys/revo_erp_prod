/*
  Fiscal 2026 — Part 4A: IBS/CBS Toggle RPC

  Adds a toggle for IBS/CBS feature per empresa.
  The column fiscal_ibs_cbs_enabled was added in migration 1B (20270320110000).
  This migration adds RPCs to get/set the flag.
*/

-- =========================================================
-- 1. fiscal_ibs_cbs_toggle — set the feature flag
-- =========================================================
CREATE OR REPLACE FUNCTION public.fiscal_ibs_cbs_toggle(
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  UPDATE public.empresa_feature_flags
  SET fiscal_ibs_cbs_enabled = p_enabled,
      updated_at = now()
  WHERE empresa_id = v_empresa;

  -- If no row exists, insert one
  IF NOT FOUND THEN
    INSERT INTO public.empresa_feature_flags (empresa_id, fiscal_ibs_cbs_enabled, updated_at)
    VALUES (v_empresa, p_enabled, now())
    ON CONFLICT (empresa_id) DO UPDATE
    SET fiscal_ibs_cbs_enabled = p_enabled, updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'fiscal_ibs_cbs_enabled', p_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_ibs_cbs_toggle(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_ibs_cbs_toggle(boolean) TO authenticated, service_role;


-- =========================================================
-- 2. fiscal_ibs_cbs_status — get current flag state
-- =========================================================
CREATE OR REPLACE FUNCTION public.fiscal_ibs_cbs_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_enabled boolean;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  SELECT fiscal_ibs_cbs_enabled INTO v_enabled
  FROM public.empresa_feature_flags
  WHERE empresa_id = v_empresa;

  RETURN jsonb_build_object(
    'ok', true,
    'fiscal_ibs_cbs_enabled', COALESCE(v_enabled, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_ibs_cbs_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_ibs_cbs_status() TO authenticated, service_role;


-- Notify PostgREST schema reload
SELECT pg_notify('pgrst', 'reload schema');
