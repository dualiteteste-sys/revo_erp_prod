-- =============================================================================
-- Hardening: revogar EXECUTE de PUBLIC e fixar search_path (funções util/trigger)
-- Data: 2025-11-07
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      n.nspname  AS schema_name,
      p.proname  AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        'months_from',
        'os_calc_item_total',
        'str_tokenize',
        'tg_os_after_change_recalc',
        'tg_os_item_after_recalc',
        'tg_os_item_total_and_recalc',
        'tg_os_set_numero'
      )
  LOOP
    -- 1) Revoga EXECUTE de PUBLIC (idempotente)
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
                   r.schema_name, r.func_name, r.args);

    -- 2) Concede EXECUTE a authenticated e service_role (idempotente)
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
                   r.schema_name, r.func_name, r.args);

    -- 3) Padroniza search_path seguro (mesmo não sendo SECURITY DEFINER)
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = %L',
                   r.schema_name, r.func_name, r.args,
                   'pg_catalog, public');
  END LOOP;

  PERFORM pg_notify('app_log',
    '[GRANTS] cleaned PUBLIC + set search_path on 7 utility/trigger functions');
END
$$ LANGUAGE plpgsql;

-- Smoke: deve retornar ZERO linhas
-- 1) Restou EXECUTE para PUBLIC?
-- SELECT routine_schema, routine_name, privilege_type, grantee
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
--   AND privilege_type = 'EXECUTE'
--   AND grantee = 'PUBLIC'
-- ORDER BY 1,2;
