/*
  P1.2/P2.1: RPC-first para tabelas sensíveis + idempotência básica

  Objetivo:
  - Remover acessos PostgREST diretos no client para:
    - public.empresa_entitlements (plano/limites)
    - public.audit_logs (trilha de auditoria)
  - Expor RPCs tenant-safe.
  - Aplicar idempotência (best-effort) no upsert de entitlements.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- empresa_entitlements (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.empresa_entitlements_get_for_current_empresa();
CREATE OR REPLACE FUNCTION public.empresa_entitlements_get_for_current_empresa()
RETURNS TABLE(
  empresa_id uuid,
  plano_mvp text,
  max_users int,
  max_nfe_monthly int,
  updated_at timestamptz
)
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

  PERFORM public.assert_empresa_role_at_least('member');

  RETURN QUERY
  SELECT
    v_empresa,
    COALESCE(e.plano_mvp, 'ambos')::text,
    COALESCE(e.max_users, 999)::int,
    COALESCE(e.max_nfe_monthly, 999)::int,
    e.updated_at
  FROM public.empresa_entitlements e
  WHERE e.empresa_id = v_empresa
  UNION ALL
  SELECT
    v_empresa,
    'ambos'::text,
    999::int,
    999::int,
    NULL::timestamptz
  WHERE NOT EXISTS (SELECT 1 FROM public.empresa_entitlements x WHERE x.empresa_id = v_empresa)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.empresa_entitlements_get_for_current_empresa() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_entitlements_get_for_current_empresa() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.empresa_entitlements_upsert_for_current_empresa(text, int, int, text);
CREATE OR REPLACE FUNCTION public.empresa_entitlements_upsert_for_current_empresa(
  p_plano_mvp text,
  p_max_users int,
  p_max_nfe_monthly int,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE(
  empresa_id uuid,
  plano_mvp text,
  max_users int,
  max_nfe_monthly int,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_plano text := COALESCE(NULLIF(btrim(p_plano_mvp), ''), 'ambos');
  v_max_users int := COALESCE(p_max_users, 999);
  v_max_nfe int := COALESCE(p_max_nfe_monthly, 999);
  v_idemp text := NULLIF(btrim(COALESCE(p_idempotency_key,'')), '');
  v_first boolean := true;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('admin');

  -- Best-effort idempotency (dedupe de double-submit/latência)
  IF v_idemp IS NOT NULL THEN
    v_first := public.idempotency_try_acquire(v_idemp, 'empresa_entitlements_upsert', interval '24 hours');
  END IF;

  IF v_plano NOT IN ('servicos','industria','ambos') THEN
    RAISE EXCEPTION 'Plano MVP inválido.' USING errcode='22023';
  END IF;
  IF v_max_users < 1 THEN
    RAISE EXCEPTION 'max_users inválido.' USING errcode='22023';
  END IF;
  IF v_max_nfe < 0 THEN
    RAISE EXCEPTION 'max_nfe_monthly inválido.' USING errcode='22023';
  END IF;

  INSERT INTO public.empresa_entitlements AS ee (empresa_id, plano_mvp, max_users, max_nfe_monthly)
  VALUES (v_empresa, v_plano, v_max_users, v_max_nfe)
  ON CONFLICT (empresa_id)
  DO UPDATE SET
    plano_mvp = EXCLUDED.plano_mvp,
    max_users = EXCLUDED.max_users,
    max_nfe_monthly = EXCLUDED.max_nfe_monthly,
    updated_at = now()
  RETURNING ee.empresa_id, ee.plano_mvp, ee.max_users, ee.max_nfe_monthly, ee.updated_at
  INTO empresa_id, plano_mvp, max_users, max_nfe_monthly, updated_at;

  -- Em caso de retry idempotente, ainda retornamos o row atual.
  IF NOT v_first THEN
    RETURN;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.empresa_entitlements_upsert_for_current_empresa(text, int, int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_entitlements_upsert_for_current_empresa(text, int, int, text) TO authenticated, service_role;

-- Remove acesso direto via PostgREST (RPC-first). Views/triggers continuam funcionando.
REVOKE ALL ON TABLE public.empresa_entitlements FROM public;
REVOKE ALL ON TABLE public.empresa_entitlements FROM anon;
REVOKE ALL ON TABLE public.empresa_entitlements FROM authenticated;
GRANT ALL ON TABLE public.empresa_entitlements TO service_role;

-- -----------------------------------------------------------------------------
-- audit_logs (RPC-first)
-- -----------------------------------------------------------------------------
-- Já existe RPC public.audit_logs_list_for_tables(text[], int). Apenas revogamos grants diretos.
REVOKE ALL ON TABLE public.audit_logs FROM public;
REVOKE ALL ON TABLE public.audit_logs FROM anon;
REVOKE ALL ON TABLE public.audit_logs FROM authenticated;
GRANT SELECT ON TABLE public.audit_logs TO service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

