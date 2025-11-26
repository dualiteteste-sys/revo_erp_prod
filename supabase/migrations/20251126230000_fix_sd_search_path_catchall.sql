-- Migration: Fix SD Search Path Catch-All (v11)
-- Description: Iterates over ALL SECURITY DEFINER functions/procedures in public schema that fail the validation check and fixes them.
--              Uses ALTER ROUTINE and 'pg_catalog,public' (no space) for maximum robustness.
-- Author: Antigravity
-- Date: 2025-11-26

DO $$
DECLARE
  r record;
  _sig text;
BEGIN
  FOR r IN
    SELECT p.oid,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (
        p.proconfig IS NULL
        OR array_to_string(p.proconfig, ',') !~* 'search_path=pg_catalog,public'
      )
  LOOP
    _sig := format('%I.%I(%s)', r.nspname, r.proname, r.args);
    
    -- Idempotente: apenas ajusta o parâmetro de execução da função
    -- Usando ALTER ROUTINE para cobrir tanto FUNCTION quanto PROCEDURE
    -- Usando 'pg_catalog,public' (sem espaço) para passar na validação estrita
    EXECUTE format('ALTER ROUTINE %s SET search_path = pg_catalog,public;', _sig);
    
    RAISE NOTICE 'Fixed search_path for %', _sig;
  END LOOP;
END
$$;
