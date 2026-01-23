/*
  FIX: PRO/Scale users receiving 403 "Recurso indisponível no plano atual (industria)"
  on core/billing/dashboard RPCs that should be available regardless of plan.

  Root cause (observed in PROD): these RPCs were (re)defined with
  `require_plano_mvp_allows('industria')`, making them fail for non-industry plans.

  This migration redefines the affected RPCs WITHOUT plan gating (still enforces:
  - empresa ativa
  - RBAC role mínimo
  - tenant isolation
  ).

  IMPORTANT: any change in Supabase must be a migration.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- empresa_entitlements_get_for_current_empresa (member)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- empresa_features_get (member) — do NOT gate by plan (returns booleans per plan)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.empresa_features_get()
RETURNS TABLE(
  revo_send_enabled boolean,
  nfe_emissao_enabled boolean,
  plano_mvp text,
  max_users int,
  max_nfe_monthly int,
  servicos_enabled boolean,
  industria_enabled boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_plano text;
  v_max_users int;
  v_max_nfe int;
  v_ent_updated timestamptz;
  v_nfe_enabled boolean;
  v_ff_updated timestamptz;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  SELECT
    COALESCE(ent.plano_mvp, 'ambos')::text,
    COALESCE(ent.max_users, 999)::int,
    COALESCE(ent.max_nfe_monthly, 999)::int,
    ent.updated_at
  INTO v_plano, v_max_users, v_max_nfe, v_ent_updated
  FROM public.empresa_entitlements ent
  WHERE ent.empresa_id = v_empresa;

  IF NOT FOUND THEN
    v_plano := 'ambos';
    v_max_users := 999;
    v_max_nfe := 999;
    v_ent_updated := NULL;
  END IF;

  SELECT
    COALESCE(ff.nfe_emissao_enabled, false),
    ff.updated_at
  INTO v_nfe_enabled, v_ff_updated
  FROM public.empresa_feature_flags ff
  WHERE ff.empresa_id = v_empresa;

  IF NOT FOUND THEN
    v_nfe_enabled := false;
    v_ff_updated := NULL;
  END IF;

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1
      FROM public.empresa_addons ea
      WHERE ea.empresa_id = v_empresa
        AND ea.addon_slug = 'REVO_SEND'
        AND ea.status = ANY (ARRAY['active'::text, 'trialing'::text])
        AND COALESCE(ea.cancel_at_period_end, false) = false
    ) AS revo_send_enabled,
    v_nfe_enabled AS nfe_emissao_enabled,
    v_plano AS plano_mvp,
    v_max_users AS max_users,
    v_max_nfe AS max_nfe_monthly,
    (v_plano IN ('servicos','ambos')) AS servicos_enabled,
    (v_plano IN ('industria','ambos')) AS industria_enabled,
    COALESCE(GREATEST(v_ent_updated, v_ff_updated), v_ent_updated, v_ff_updated, now()) AS updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.empresa_features_get() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_features_get() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- empresa_addons_list_for_current_empresa (member)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.empresa_addons_list_for_current_empresa()
RETURNS SETOF public.empresa_addons
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
  SELECT ea.*
  FROM public.empresa_addons ea
  WHERE ea.empresa_id = v_empresa
  ORDER BY ea.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.empresa_addons_list_for_current_empresa() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_addons_list_for_current_empresa() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- billing_stripe_webhook_events_list (member)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_stripe_webhook_events_list(
  p_limit int DEFAULT 12,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  received_at timestamptz,
  event_type text,
  plan_slug text,
  billing_cycle text,
  subscription_status text,
  current_period_end timestamptz,
  processed_at timestamptz,
  last_error text,
  process_attempts int,
  stripe_event_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
BEGIN
  PERFORM public.assert_empresa_role_at_least('member');

  IF v_emp IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Nenhuma empresa ativa. Selecione uma empresa e tente novamente.';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.received_at,
    e.event_type,
    e.plan_slug,
    e.billing_cycle,
    e.subscription_status,
    e.current_period_end,
    e.processed_at,
    e.last_error,
    e.process_attempts,
    e.stripe_event_id
  FROM public.billing_stripe_webhook_events e
  WHERE e.empresa_id = v_emp
  ORDER BY e.received_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.billing_stripe_webhook_events_list(int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_stripe_webhook_events_list(int, int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- dashboard_activity_feed (member)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_activity_feed(
  p_limit int DEFAULT 12
)
RETURNS TABLE(
  id uuid,
  level text,
  source text,
  event text,
  message text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 12), 0), 50);
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  RETURN QUERY
  SELECT
    a.id,
    a.level,
    a.source,
    a.event,
    a.message,
    a.created_at
  FROM public.app_logs a
  WHERE a.empresa_id = v_empresa_id
  ORDER BY a.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_activity_feed(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_activity_feed(int) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

