/*
  BETA HOTFIX (temporário): liberar acesso total para todos os usuários/empresas
  -------------------------------------------------------------------------
  Objetivo: eliminar 403 por plano/permissões enquanto estabilizamos o core.

  Importante:
  - NÃO desliga RLS multi-tenant (isolamento por empresa continua valendo).
  - Apenas ignora:
    - gating por plano: plano_mvp_allows / require_plano_mvp_allows
    - RBAC por permissões: has_permission_for_current_user / require_permission_for_current_user
    - rank mínimo: assert_empresa_role_at_least
  - Reversível: basta setar ops_runtime_flags.beta_unlock_all_access=false.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Runtime flag (sem grants para client)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ops_runtime_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.ops_runtime_flags FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_runtime_flags TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.beta_unlock_all_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT f.enabled FROM public.ops_runtime_flags f WHERE f.key = 'beta_unlock_all_access' LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.beta_unlock_all_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.beta_unlock_all_access() TO authenticated, service_role, postgres;

INSERT INTO public.ops_runtime_flags(key, enabled)
VALUES ('beta_unlock_all_access', true)
ON CONFLICT (key) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      updated_at = now();

-- -----------------------------------------------------------------------------
-- Plan gating: bypass global
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plano_mvp_allows(p_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN public.beta_unlock_all_access() THEN true
      WHEN public.is_service_role() THEN true
      WHEN public.current_empresa_id() IS NULL THEN false
      WHEN lower(coalesce(p_feature,'')) = 'industria'
        THEN COALESCE((SELECT ee.plano_mvp FROM public.empresa_entitlements ee WHERE ee.empresa_id = public.current_empresa_id()), 'ambos')
             IN ('industria','ambos')
      WHEN lower(coalesce(p_feature,'')) = 'servicos'
        THEN COALESCE((SELECT ee.plano_mvp FROM public.empresa_entitlements ee WHERE ee.empresa_id = public.current_empresa_id()), 'ambos')
             IN ('servicos','ambos')
      ELSE true
    END;
$$;

REVOKE ALL ON FUNCTION public.plano_mvp_allows(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.plano_mvp_allows(text) TO authenticated, service_role, postgres;

-- -----------------------------------------------------------------------------
-- RBAC gating: bypass global
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission_for_current_user(p_module text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_uid uuid := public.current_user_id();
  v_role uuid := public.current_role_id();
  v_perm uuid;
  v_override boolean;
  v_allowed boolean;
BEGIN
  IF public.beta_unlock_all_access() THEN
    RETURN true;
  END IF;

  IF public.is_service_role() THEN
    RETURN true;
  END IF;

  IF v_emp IS NULL OR v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT id INTO v_perm
  FROM public.permissions
  WHERE module = p_module AND action = p_action
  LIMIT 1;

  IF v_perm IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.allow INTO v_override
  FROM public.user_permission_overrides u
  WHERE u.empresa_id = v_emp
    AND u.user_id = v_uid
    AND u.permission_id = v_perm;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  IF public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin') THEN
    RETURN true;
  END IF;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  SELECT rp.allow INTO v_allowed
  FROM public.role_permissions rp
  WHERE rp.role_id = v_role AND rp.permission_id = v_perm;

  RETURN COALESCE(v_allowed, false);
END
$$;

REVOKE ALL ON FUNCTION public.has_permission_for_current_user(text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.has_permission_for_current_user(text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.require_permission_for_current_user(p_module text, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.beta_unlock_all_access() THEN
    RETURN;
  END IF;

  IF NOT public.has_permission_for_current_user(p_module, p_action) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para %/% nesta empresa.', p_module, p_action
      USING errcode = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.require_permission_for_current_user(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.require_permission_for_current_user(text, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Rank gating: bypass global (mantém empresa ativa como pré-requisito)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_empresa_role_at_least(p_min_role text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
  v_have int;
  v_need int;
  v_jwt_role text := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''));
BEGIN
  IF v_jwt_role = 'service_role' THEN
    RETURN;
  END IF;

  IF public.beta_unlock_all_access() THEN
    RETURN;
  END IF;

  -- mantém o enforcement “normal”
  PERFORM public.require_plano_mvp_allows('industria');

  v_role := public.current_empresa_role();
  v_have := public.empresa_role_rank(v_role);
  v_need := public.empresa_role_rank(p_min_role);

  IF v_need <= 0 THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Configuração inválida de permissão (role mínima).';
  END IF;

  IF v_have < v_need THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = format('Sem permissão para executar esta ação (necessário: %s).', p_min_role);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_empresa_role_at_least(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assert_empresa_role_at_least(text) TO authenticated, service_role, postgres;

-- -----------------------------------------------------------------------------
-- UX: features_get deve refletir “tudo liberado” durante o beta unlock
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
    CASE WHEN public.beta_unlock_all_access() THEN true ELSE (v_plano IN ('servicos','ambos')) END AS servicos_enabled,
    CASE WHEN public.beta_unlock_all_access() THEN true ELSE (v_plano IN ('industria','ambos')) END AS industria_enabled,
    COALESCE(GREATEST(v_ent_updated, v_ff_updated), v_ent_updated, v_ff_updated, now()) AS updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.empresa_features_get() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_features_get() TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

