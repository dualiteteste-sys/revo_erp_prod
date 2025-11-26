-- Migration: Fix SD Search Path Owner Takeover (v12)
-- Description: Fixes search_path in all public SECURITY DEFINER functions.
--              Resolves permission/ownership issues by attempting to assume ownership (postgres/current_user).
--              Uses ALTER ROUTINE and quoted 'pg_catalog,public' for maximum robustness and validation compliance.
-- Author: Antigravity (based on User provided script)
-- Date: 2025-11-26

SET search_path = pg_catalog, public;

DO $$
DECLARE
  r RECORD;
  _sig TEXT;
  _had_owner BOOLEAN := false;
  _had_path  BOOLEAN := false;
BEGIN
  -- Cria tabela de log (volátil) só durante a sessão
  CREATE TEMP TABLE IF NOT EXISTS __sd_fix_log(
    func_sig TEXT,
    step     TEXT,
    ok       BOOLEAN,
    err      TEXT
  ) ON COMMIT DROP;

  FOR r IN
    SELECT p.oid,
           n.nspname AS nsp,
           p.proname AS fname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proowner,
           p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (
        p.proconfig IS NULL
        OR array_to_string(p.proconfig, ',') !~* 'search_path=pg_catalog,public'
      )
  LOOP
    _sig := format('%I.%I(%s)', r.nsp, r.fname, r.args);
    _had_owner := false;
    _had_path  := false;

    -- 1) Tentar assumir ownership para 'postgres' (ou manter se já é)
    BEGIN
      PERFORM 1;
      -- Só tenta se não é do postgres
      IF (SELECT rolname FROM pg_roles WHERE oid = r.proowner) <> 'postgres' THEN
        EXECUTE format('ALTER ROUTINE %s OWNER TO postgres;', _sig);
      END IF;
      _had_owner := true;
      INSERT INTO __sd_fix_log VALUES (_sig, 'alter_owner_to_postgres', true, NULL);
    EXCEPTION WHEN insufficient_privilege THEN
      INSERT INTO __sd_fix_log VALUES (_sig, 'alter_owner_to_postgres', false, 'insufficient_privilege');
    WHEN OTHERS THEN
      INSERT INTO __sd_fix_log VALUES (_sig, 'alter_owner_to_postgres', false, SQLERRM);
    END;

    -- 2) Tentar aplicar o search_path
    BEGIN
      -- Usando quoted string para garantir que não haja espaços e passe na validação estrita
      EXECUTE format('ALTER ROUTINE %s SET search_path = ''pg_catalog,public'';', _sig);
      _had_path := true;
      INSERT INTO __sd_fix_log VALUES (_sig, 'set_search_path', true, NULL);
    EXCEPTION WHEN insufficient_privilege THEN
      INSERT INTO __sd_fix_log VALUES (_sig, 'set_search_path', false, 'insufficient_privilege');
    WHEN OTHERS THEN
      INSERT INTO __sd_fix_log VALUES (_sig, 'set_search_path', false, SQLERRM);
    END;

    -- 3) Se ainda não conseguiu por falta de owner, tenta flipar owner -> current_user e depois de volta pra postgres
    IF NOT _had_path THEN
      BEGIN
        -- Tenta assumir ownership para o usuário atual (se for possível) e voltar para postgres
        EXECUTE format('ALTER ROUTINE %s OWNER TO CURRENT_USER;', _sig);
        INSERT INTO __sd_fix_log VALUES (_sig, 'alter_owner_to_current_user', true, NULL);
      EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO __sd_fix_log VALUES (_sig, 'alter_owner_to_current_user', false, 'insufficient_privilege');
      WHEN OTHERS THEN
        INSERT INTO __sd_fix_log VALUES (_sig, 'alter_owner_to_current_user', false, SQLERRM);
      END;

      BEGIN
        EXECUTE format('ALTER ROUTINE %s SET search_path = ''pg_catalog,public'';', _sig);
        _had_path := true;
        INSERT INTO __sd_fix_log VALUES (_sig, 'set_search_path_retry', true, NULL);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO __sd_fix_log VALUES (_sig, 'set_search_path_retry', false, SQLERRM);
      END;

      -- volta owner para postgres se for possível
      BEGIN
        EXECUTE format('ALTER ROUTINE %s OWNER TO postgres;', _sig);
        INSERT INTO __sd_fix_log VALUES (_sig, 'restore_owner_postgres', true, NULL);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO __sd_fix_log VALUES (_sig, 'restore_owner_postgres', false, SQLERRM);
      END;
    END IF;
  END LOOP;

  -- Relatório final (NOTICE) com o que ainda falta
  RAISE NOTICE '--- SD sem search_path fixo após tentativa ---';
  FOR r IN
    SELECT p.oid::regprocedure AS func
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (p.proconfig IS NULL OR array_to_string(p.proconfig, ',') !~* 'search_path=pg_catalog,public')
    ORDER BY 1
  LOOP
    RAISE NOTICE 'Pendente: %', r.func;
  END LOOP;

  RAISE NOTICE '--- Log resumido ---';
  FOR r IN
    SELECT * FROM __sd_fix_log ORDER BY func_sig, step
  LOOP
    RAISE NOTICE '% | % | ok=% | %', r.func_sig, r.step, r.ok, coalesce(r.err,'');
  END LOOP;

END
$$;
