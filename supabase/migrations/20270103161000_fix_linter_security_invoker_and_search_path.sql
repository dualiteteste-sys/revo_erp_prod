/*
  Supabase Database Linter hardening (PROD):
  - ERROR 0010: security_definer_view (views devem ser SECURITY INVOKER)
  - WARN 0011: function_search_path_mutable (funções sem search_path fixo)

  Objetivo:
  - Reduzir superfície de ataque e evitar bypass de RLS/permissões por search_path.
  - Ajustes idempotentes: só aplicam se objetos existirem.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) View: garantir SECURITY INVOKER (Postgres 15+)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_ver int := current_setting('server_version_num')::int;
BEGIN
  IF v_ver >= 150000 AND to_regclass('public.industria_roteiro_etapas') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.industria_roteiro_etapas SET (security_invoker = true)';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Functions: fixar search_path (evita role-mutable search_path)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.empresa_role_rank(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.empresa_role_rank(text) SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.current_jwt_role()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.current_jwt_role() SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.is_service_role()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.is_service_role() SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.normalize_empresa_role(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.normalize_empresa_role(text) SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.set_updated_at_timestamp()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.set_updated_at_timestamp() SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.tg_set_updated_at()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.tg_set_updated_at() SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.partners_search_match(public.pessoas,text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.partners_search_match(public.pessoas,text) SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.os_calc_item_total(numeric,numeric,numeric)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.os_calc_item_total(numeric,numeric,numeric) SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.plano_mvp_allows(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.plano_mvp_allows(text) SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.fiscal_digits_only(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.fiscal_digits_only(text) SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.fiscal_xml_escape(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.fiscal_xml_escape(text) SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public.tg_vendas_expedicoes_autofill_dates()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.tg_vendas_expedicoes_autofill_dates() SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public._ind01_normalize_status(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._ind01_normalize_status(text) SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public._ind02_op_status_to_ui(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._ind02_op_status_to_ui(text) SET search_path = pg_catalog, public';
  END IF;

  IF to_regprocedure('public._ind02_op_status_to_db(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._ind02_op_status_to_db(text) SET search_path = pg_catalog, public';
  END IF;
END $$;

select pg_notify('pgrst', 'reload schema');

COMMIT;

