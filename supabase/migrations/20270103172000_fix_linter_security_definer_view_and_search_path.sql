/*
  Supabase Database Linter (PROD) — correção para:
  - 0010 security_definer_view: view `public.industria_roteiro_etapas`
  - 0011 function_search_path_mutable: funções sem search_path fixo

  Observações:
  - Alguns providers/versões podem expor a opção como `security_invoker` (PG15+).
  - Alguns ambientes podem ter reloption `security_definer` (não documentada); tentamos resetar com fallback seguro.
  - Tudo é idempotente e protegido por checks de existência.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- View: remover sinalização de "security definer view"
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_ver int := current_setting('server_version_num')::int;
BEGIN
  IF to_regclass('public.industria_roteiro_etapas') IS NULL THEN
    RETURN;
  END IF;

  -- Se existir reloption `security_definer`, tenta desligar/resetar (sem quebrar se não existir).
  BEGIN
    EXECUTE 'ALTER VIEW public.industria_roteiro_etapas SET (security_definer = false)';
  EXCEPTION WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE 'ALTER VIEW public.industria_roteiro_etapas RESET (security_definer)';
  EXCEPTION WHEN others THEN
    NULL;
  END;

  -- Em PG15+, preferir "security invoker views".
  IF v_ver >= 150000 THEN
    BEGIN
      EXECUTE 'ALTER VIEW public.industria_roteiro_etapas SET (security_invoker = true)';
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Functions: fixar search_path (evita role-mutable search_path)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.empresa_role_rank(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.empresa_role_rank(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.current_jwt_role()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.current_jwt_role() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.is_service_role()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.is_service_role() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.normalize_empresa_role(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.normalize_empresa_role(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.set_updated_at_timestamp()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.set_updated_at_timestamp() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.tg_set_updated_at()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.tg_set_updated_at() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.partners_search_match(public.pessoas,text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.partners_search_match(public.pessoas,text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.os_calc_item_total(numeric,numeric,numeric)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.os_calc_item_total(numeric,numeric,numeric) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.plano_mvp_allows(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.plano_mvp_allows(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.fiscal_digits_only(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.fiscal_digits_only(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.fiscal_xml_escape(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.fiscal_xml_escape(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.tg_vendas_expedicoes_autofill_dates()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.tg_vendas_expedicoes_autofill_dates() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public._ind01_normalize_status(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._ind01_normalize_status(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public._ind02_op_status_to_ui(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._ind02_op_status_to_ui(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public._ind02_op_status_to_db(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._ind02_op_status_to_db(text) SET search_path TO pg_catalog, public';
  END IF;
END $$;

select pg_notify('pgrst', 'reload schema');

COMMIT;

