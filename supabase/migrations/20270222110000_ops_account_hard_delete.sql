/*
  OPS — Exclusão completa de conta (tenant) com trilha de auditoria.

  Objetivo:
  - Permitir que usuários com `ops:manage` removam completamente a empresa ativa.
  - Remover dados tenant-scoped, empresa, storage por pasta {empresa_id}/ e usuários auth órfãos.
  - Manter trilha auditável do pedido/resultado.

  Segurança:
  - RPC-first + SECURITY DEFINER.
  - Gate RBAC obrigatório (`require_permission_for_current_user('ops','manage')`).
  - Confirmação textual obrigatória: EXCLUIR <empresa_id>.
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_account_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_empresa_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason text,
  status text NOT NULL CHECK (status IN ('running','success','failed')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_account_deletion_audit_created_at_idx
  ON public.ops_account_deletion_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS ops_account_deletion_audit_target_empresa_idx
  ON public.ops_account_deletion_audit (target_empresa_id, created_at DESC);

ALTER TABLE public.ops_account_deletion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_account_deletion_audit_select_ops ON public.ops_account_deletion_audit;
CREATE POLICY ops_account_deletion_audit_select_ops
  ON public.ops_account_deletion_audit
  FOR SELECT
  TO authenticated
  USING (public.has_permission_for_current_user('ops','manage'));

DROP POLICY IF EXISTS ops_account_deletion_audit_insert_deny ON public.ops_account_deletion_audit;
CREATE POLICY ops_account_deletion_audit_insert_deny
  ON public.ops_account_deletion_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ops_account_deletion_audit_update_deny ON public.ops_account_deletion_audit;
CREATE POLICY ops_account_deletion_audit_update_deny
  ON public.ops_account_deletion_audit
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS ops_account_deletion_audit_delete_deny ON public.ops_account_deletion_audit;
CREATE POLICY ops_account_deletion_audit_delete_deny
  ON public.ops_account_deletion_audit
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE ALL ON TABLE public.ops_account_deletion_audit FROM public, anon;
GRANT SELECT ON TABLE public.ops_account_deletion_audit TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ops_account_delete_preview_current_empresa();
CREATE OR REPLACE FUNCTION public.ops_account_delete_preview_current_empresa()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_empresa_id uuid;
  v_empresa_nome text;
  v_empresa_slug text;
  v_memberships_count integer := 0;
  v_auth_users_delete_count integer := 0;
  v_scoped_table_count integer := 0;
  v_scoped_rows_total bigint := 0;
  v_rows bigint := 0;
  v_users jsonb := '[]'::jsonb;
  v_table_counts jsonb := '[]'::jsonb;
  r record;
BEGIN
  PERFORM public.require_permission_for_current_user('ops','manage');

  v_empresa_id := public.current_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa no contexto atual.' USING errcode = '42501';
  END IF;

  SELECT e.nome, e.slug
    INTO v_empresa_nome, v_empresa_slug
  FROM public.empresas e
  WHERE e.id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa ativa não encontrada para exclusão.' USING errcode = 'P0002';
  END IF;

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

  SELECT count(*)::integer INTO v_memberships_count FROM tmp_ops_delete_member_users;
  SELECT count(*)::integer INTO v_auth_users_delete_count FROM tmp_ops_delete_auth_users;

  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', mu.user_id,
          'email', au.email,
          'memberships_total', (
            SELECT count(*)::integer
            FROM public.empresa_usuarios eu
            WHERE eu.user_id = mu.user_id
          ),
          'will_delete_auth', EXISTS (
            SELECT 1 FROM tmp_ops_delete_auth_users au2 WHERE au2.user_id = mu.user_id
          )
        )
        ORDER BY au.email NULLS LAST
      ),
      '[]'::jsonb
    )
  INTO v_users
  FROM tmp_ops_delete_member_users mu
  LEFT JOIN auth.users au ON au.id = mu.user_id;

  CREATE TEMP TABLE tmp_ops_table_counts(table_name text, row_count bigint) ON COMMIT DROP;

  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE a.attname = 'empresa_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND c.relkind = 'r'
      AND n.nspname = 'public'
      AND c.relname <> 'ops_account_deletion_audit'
    ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*)::bigint FROM public.%I WHERE empresa_id = $1', r.table_name)
      INTO v_rows
      USING v_empresa_id;
    INSERT INTO tmp_ops_table_counts(table_name, row_count) VALUES (r.table_name, COALESCE(v_rows, 0));
  END LOOP;

  SELECT count(*)::integer, COALESCE(sum(row_count), 0)
    INTO v_scoped_table_count, v_scoped_rows_total
  FROM tmp_ops_table_counts;

  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object('table_name', tc.table_name, 'rows', tc.row_count)
        ORDER BY tc.row_count DESC, tc.table_name ASC
      ),
      '[]'::jsonb
    )
  INTO v_table_counts
  FROM tmp_ops_table_counts tc
  WHERE tc.row_count > 0;

  RETURN jsonb_build_object(
    'empresa_id', v_empresa_id,
    'empresa_nome', v_empresa_nome,
    'empresa_slug', v_empresa_slug,
    'memberships_count', v_memberships_count,
    'auth_users_delete_count', v_auth_users_delete_count,
    'scoped_tables_count', v_scoped_table_count,
    'scoped_rows_total', v_scoped_rows_total,
    'required_confirmation', format('EXCLUIR %s', v_empresa_id::text),
    'users', v_users,
    'table_counts', v_table_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_account_delete_preview_current_empresa() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_account_delete_preview_current_empresa() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ops_account_deletion_audit_list(integer);
CREATE OR REPLACE FUNCTION public.ops_account_deletion_audit_list(p_limit integer DEFAULT 20)
RETURNS TABLE(
  id uuid,
  target_empresa_id uuid,
  requested_by uuid,
  reason text,
  status text,
  result jsonb,
  error_message text,
  executed_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    a.id,
    a.target_empresa_id,
    a.requested_by,
    a.reason,
    a.status,
    a.result,
    a.error_message,
    a.executed_at,
    a.created_at
  FROM public.ops_account_deletion_audit a
  WHERE public.has_permission_for_current_user('ops','manage')
  ORDER BY a.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;

REVOKE ALL ON FUNCTION public.ops_account_deletion_audit_list(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_account_deletion_audit_list(integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ops_account_delete_current_empresa(text, text);
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
  v_deleted_empresas_rows bigint := 0;
  v_deleted_profiles_rows bigint := 0;
  v_deleted_identities_rows bigint := 0;
  v_deleted_sessions_rows bigint := 0;
  v_deleted_refresh_tokens_rows bigint := 0;
  v_deleted_auth_users_rows bigint := 0;
  v_deleted_memberships_rows bigint := 0;
  v_deleted_tables jsonb := '{}'::jsonb;
  v_result jsonb := '{}'::jsonb;
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

  DELETE FROM storage.objects o
  WHERE (storage.foldername(o.name))[1] = v_empresa_id::text;
  GET DIAGNOSTICS v_deleted_storage_rows = ROW_COUNT;

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

REVOKE ALL ON FUNCTION public.ops_account_delete_current_empresa(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_account_delete_current_empresa(text, text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
