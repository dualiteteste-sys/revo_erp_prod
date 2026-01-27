/*
  OPS — Tenant isolation diagnostics (more readable / actionable)

  Adds human-friendly fields (empresa nome + user email) to the existing diagnostics,
  and provides a richer products->empresa lookup for the tenant leakage probe UI.
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) DEV/OPS: Expand context diagnostics (names + user email)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dev_empresa_context_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := public.current_user_id();
  v_user_email text;
  v_guc text := nullif(current_setting('app.current_empresa_id', true), '');
  v_current uuid := public.current_empresa_id();
  v_active uuid;
  v_memberships int := 0;

  v_current_name text;
  v_active_name text;
  v_guc_name text;

  j jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_authenticated'
    );
  END IF;

  -- user email (best-effort; do not fail diagnostics if auth schema is not accessible)
  BEGIN
    SELECT u.email
    INTO v_user_email
    FROM auth.users u
    WHERE u.id = v_uid;
  EXCEPTION WHEN OTHERS THEN
    v_user_email := NULL;
  END;

  SELECT uae.empresa_id INTO v_active
  FROM public.user_active_empresa uae
  WHERE uae.user_id = v_uid
  LIMIT 1;

  SELECT COUNT(*) INTO v_memberships
  FROM public.empresa_usuarios eu
  WHERE eu.user_id = v_uid;

  -- Empresa display names (best-effort, resilient to schema changes)
  IF v_current IS NOT NULL THEN
    SELECT to_jsonb(e) INTO j FROM public.empresas e WHERE e.id = v_current;
    v_current_name := COALESCE(
      NULLIF(j->>'nome_fantasia',''),
      NULLIF(j->>'razao_social',''),
      NULLIF(j->>'nome',''),
      v_current::text
    );
  END IF;

  IF v_active IS NOT NULL THEN
    SELECT to_jsonb(e) INTO j FROM public.empresas e WHERE e.id = v_active;
    v_active_name := COALESCE(
      NULLIF(j->>'nome_fantasia',''),
      NULLIF(j->>'razao_social',''),
      NULLIF(j->>'nome',''),
      v_active::text
    );
  END IF;

  IF v_guc IS NOT NULL THEN
    BEGIN
      SELECT to_jsonb(e) INTO j FROM public.empresas e WHERE e.id = (v_guc::uuid);
      v_guc_name := COALESCE(
        NULLIF(j->>'nome_fantasia',''),
        NULLIF(j->>'razao_social',''),
        NULLIF(j->>'nome',''),
        v_guc
      );
    EXCEPTION WHEN OTHERS THEN
      v_guc_name := v_guc;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'user_email', v_user_email,
    'guc_current_empresa_id', v_guc,
    'guc_current_empresa_name', v_guc_name,
    'current_empresa_id', v_current,
    'current_empresa_name', v_current_name,
    'user_active_empresa_id', v_active,
    'user_active_empresa_name', v_active_name,
    'memberships_count', v_memberships,
    'now', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dev_empresa_context_diagnostics() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dev_empresa_context_diagnostics() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) OPS: Products->empresa lookup with names (for leakage probe)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.ops_debug_produtos_empresa_details(uuid[]);
CREATE OR REPLACE FUNCTION public.ops_debug_produtos_empresa_details(p_ids uuid[])
RETURNS TABLE(
  id uuid,
  empresa_id uuid,
  produto_nome text,
  sku text,
  empresa_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  j jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.empresa_id,
    p.nome,
    p.sku,
    COALESCE(
      NULLIF((to_jsonb(e)->>'nome_fantasia'),''),
      NULLIF((to_jsonb(e)->>'razao_social'),''),
      NULLIF((to_jsonb(e)->>'nome'),''),
      e.id::text
    ) AS empresa_nome
  FROM public.produtos p
  LEFT JOIN public.empresas e ON e.id = p.empresa_id
  WHERE p.id = ANY(p_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_debug_produtos_empresa_details(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_debug_produtos_empresa_details(uuid[]) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

