-- =============================================================================
-- Migração: Hardening de GRANTS e search_path em RPCs SECURITY DEFINER
-- Data: 2025-11-07
-- Objetivo: revogar 'public', garantir EXECUTE p/ authenticated, service_role
--           e fixar search_path = 'pg_catalog, public' em todas as RPCs SD.
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
      AND p.prosecdef IS TRUE              -- somente SECURITY DEFINER
      AND p.prokind = 'f'                  -- apenas funções (ignora aggregates)
  LOOP
    -- 1) Revoga tudo de PUBLIC (idempotente)
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC',
                   r.schema_name, r.func_name, r.args);

    -- 2) Garante EXECUTE para authenticated e service_role
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
                   r.schema_name, r.func_name, r.args);

    -- 3) Fixar search_path seguro
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = %L',
                   r.schema_name, r.func_name, r.args,
                   'pg_catalog, public');
  END LOOP;

  PERFORM pg_notify('app_log',
    '[RPC-GRANTS] hardened: revoked PUBLIC; granted EXECUTE to authenticated, service_role; search_path fixed');
END
$$ LANGUAGE plpgsql;

-- (Opcional) Smoke-check de privilégios (somente leitura)
-- SELECT routine_schema, routine_name, privilege_type, grantee
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
-- ORDER BY 1,2,3,4;
