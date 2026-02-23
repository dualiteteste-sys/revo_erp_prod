BEGIN;

CREATE OR REPLACE FUNCTION public.ops_account_delete_current_empresa(
  p_confirmation text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, storage, extensions
AS $$
DECLARE
  v_empresa_id uuid;
  v_actor_id uuid;
  v_expected_confirmation text;
  v_deleted_rows bigint := 0;
  v_deleted_storage_rows bigint := 0;
  v_storage_objects_pending bigint := 0;
  v_deleted_empresas_rows bigint := 0;
  v_deleted_profiles_rows bigint := 0;
  v_deleted_identities_rows bigint := 0;
  v_deleted_sessions_rows bigint := 0;
  v_deleted_refresh_tokens_rows bigint := 0;
  v_deleted_auth_users_rows bigint := 0;
  v_deleted_memberships_rows bigint := 0;
  v_deleted_tables jsonb := '{}'::jsonb;
  v_result jsonb := '{}'::jsonb;
  v_storage_cleanup_status text := 'not_started';
  v_audit_id uuid := gen_random_uuid();
  v_progress boolean := false;
  v_pass integer := 0;
  r record;
BEGIN
  PERFORM public.require_permission_for_current_user('ops','manage');

  v_empresa_id := public.current_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa no contexto atual.' USING errcode = '42501';
  END IF;

  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida para executar exclusão.' USING errcode = '42501';
  END IF;

  v_expected_confirmation := format('EXCLUIR %s', v_empresa_id::text);
  IF coalesce(trim(p_confirmation), '') <> v_expected_confirmation THEN
    RAISE EXCEPTION 'Confirmação inválida. Digite exatamente: %', v_expected_confirmation USING errcode = '22023';
  END IF;

  INSERT INTO public.ops_account_deletion_audit (
    id,
    target_empresa_id,
    requested_by,
    reason,
    status,
    result
  ) VALUES (
    v_audit_id,
    v_empresa_id,
    v_actor_id,
    NULLIF(trim(p_reason), ''),
    'running',
    jsonb_build_object('started_at', now())
  );

  CREATE TEMP TABLE tmp_ops_delete_member_users(user_id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO tmp_ops_delete_member_users(user_id)
  SELECT DISTINCT eu.user_id
  FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = v_empresa_id;

  CREATE TEMP TABLE tmp_ops_delete_auth_users(user_id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO tmp_ops_delete_auth_users(user_id)
  SELECT mu.user_id
  FROM tmp_ops_delete_member_users mu
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.user_id = mu.user_id
      AND eu.empresa_id <> v_empresa_id
  );

  SELECT count(*)::bigint INTO v_deleted_memberships_rows FROM tmp_ops_delete_member_users;

  CREATE TEMP TABLE tmp_ops_delete_tables(table_name text, done boolean default false, attempts integer default 0) ON COMMIT DROP;
  INSERT INTO tmp_ops_delete_tables(table_name)
  SELECT c.relname
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE a.attname = 'empresa_id'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND c.relkind = 'r'
    AND n.nspname = 'public'
    AND c.relname <> 'ops_account_deletion_audit'
  ORDER BY c.relname;

  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tmp_ops_delete_tables WHERE done = false);

    v_pass := v_pass + 1;
    v_progress := false;

    FOR r IN
      SELECT table_name
      FROM tmp_ops_delete_tables
      WHERE done = false
      ORDER BY attempts ASC, table_name ASC
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE empresa_id = $1', r.table_name)
          USING v_empresa_id;
        GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

        v_deleted_tables := v_deleted_tables || jsonb_build_object(r.table_name, v_deleted_rows);

        UPDATE tmp_ops_delete_tables
          SET done = true
        WHERE table_name = r.table_name;
        v_progress := true;
      EXCEPTION
        WHEN foreign_key_violation THEN
          UPDATE tmp_ops_delete_tables
            SET attempts = attempts + 1
          WHERE table_name = r.table_name;
        WHEN undefined_table THEN
          UPDATE tmp_ops_delete_tables
            SET done = true
          WHERE table_name = r.table_name;
      END;
    END LOOP;

    IF NOT v_progress THEN
      RAISE EXCEPTION 'Exclusão bloqueada por constraints. Tabelas restantes: %',
        (
          SELECT string_agg(format('%I(attempts=%s)', table_name, attempts), ', ')
          FROM tmp_ops_delete_tables
          WHERE done = false
        );
    END IF;

    IF v_pass > 50 THEN
      RAISE EXCEPTION 'Exclusão excedeu passadas máximas (%).', v_pass;
    END IF;
  END LOOP;

  BEGIN
    SELECT count(*)::bigint
      INTO v_storage_objects_pending
    FROM storage.objects o
    WHERE (storage.foldername(o.name))[1] = v_empresa_id::text;
  EXCEPTION
    WHEN OTHERS THEN
      v_storage_objects_pending := 0;
  END;

  v_storage_cleanup_status := 'pending_storage_api_cleanup';
  v_deleted_storage_rows := 0;

  DELETE FROM public.empresas e
  WHERE e.id = v_empresa_id;
  GET DIAGNOSTICS v_deleted_empresas_rows = ROW_COUNT;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.profiles WHERE id = ANY(SELECT user_id FROM tmp_ops_delete_auth_users)';
    GET DIAGNOSTICS v_deleted_profiles_rows = ROW_COUNT;
  END IF;

  IF to_regclass('auth.identities') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.identities WHERE user_id = ANY(SELECT user_id FROM tmp_ops_delete_auth_users)';
    GET DIAGNOSTICS v_deleted_identities_rows = ROW_COUNT;
  END IF;

  IF to_regclass('auth.sessions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.sessions WHERE user_id = ANY(SELECT user_id FROM tmp_ops_delete_auth_users)';
    GET DIAGNOSTICS v_deleted_sessions_rows = ROW_COUNT;
  END IF;

  IF to_regclass('auth.refresh_tokens') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.refresh_tokens WHERE user_id = ANY(SELECT user_id FROM tmp_ops_delete_auth_users)';
    GET DIAGNOSTICS v_deleted_refresh_tokens_rows = ROW_COUNT;
  END IF;

  EXECUTE 'DELETE FROM auth.users WHERE id = ANY(SELECT user_id FROM tmp_ops_delete_auth_users)';
  GET DIAGNOSTICS v_deleted_auth_users_rows = ROW_COUNT;

  v_result := jsonb_build_object(
    'empresa_id', v_empresa_id,
    'deleted_tables', v_deleted_tables,
    'deleted_storage_objects', v_deleted_storage_rows,
    'storage_cleanup_status', v_storage_cleanup_status,
    'storage_objects_pending', v_storage_objects_pending,
    'deleted_empresas_rows', v_deleted_empresas_rows,
    'deleted_memberships_candidates', v_deleted_memberships_rows,
    'deleted_profiles_rows', v_deleted_profiles_rows,
    'deleted_identities_rows', v_deleted_identities_rows,
    'deleted_sessions_rows', v_deleted_sessions_rows,
    'deleted_refresh_tokens_rows', v_deleted_refresh_tokens_rows,
    'deleted_auth_users_rows', v_deleted_auth_users_rows
  );

  UPDATE public.ops_account_deletion_audit
    SET status = 'success',
        result = v_result,
        error_message = NULL,
        executed_at = now()
  WHERE id = v_audit_id;

  RETURN v_result || jsonb_build_object('audit_id', v_audit_id);

EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.ops_account_deletion_audit
      SET status = 'failed',
          error_message = SQLERRM,
          result = jsonb_build_object(
            'sqlstate', SQLSTATE,
            'confirmation', coalesce(trim(p_confirmation), ''),
            'empresa_id', v_empresa_id
          ),
          executed_at = now()
    WHERE id = v_audit_id;
    RAISE;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
