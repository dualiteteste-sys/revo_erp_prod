/*
  MT — Tenant isolation hardening + diagnostics (estado da arte)

  Objetivos
  - Diagnóstico incontestável de "vazamento" (mostrar empresa_id real dos registros retornados).
  - Tornar `current_empresa_id()` mais estrita: não retornar empresa ativa inválida.
  - Hardening RLS da tabela `public.produtos`: remover policies duplicadas e `to public`.

  Observação
  - Funções DEV/OPS exigem permissão `ops:view`.
  - Mudanças em Supabase sempre via migration.
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) current_empresa_id() / get_preferred_empresa_for_user(): validar membership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_preferred_empresa_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1) Preferência persistida (user_active_empresa), mas só se ainda houver vínculo.
  SELECT uae.empresa_id
    INTO v_emp
    FROM public.user_active_empresa uae
   WHERE uae.user_id = p_user_id
     AND EXISTS (
       SELECT 1
       FROM public.empresa_usuarios eu
       WHERE eu.user_id = p_user_id
         AND eu.empresa_id = uae.empresa_id
     )
   LIMIT 1;

  IF v_emp IS NOT NULL THEN
    RETURN v_emp;
  END IF;

  -- 2) Fallback seguro: somente quando o usuário tem vínculo com exatamente 1 empresa.
  SELECT eu.empresa_id
    INTO v_emp
    FROM public.empresa_usuarios eu
   WHERE eu.user_id = p_user_id
   LIMIT 1;

  IF FOUND AND (
    SELECT COUNT(*) FROM public.empresa_usuarios WHERE user_id = p_user_id
  ) = 1 THEN
    RETURN v_emp;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_preferred_empresa_for_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_preferred_empresa_for_user(uuid) TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 2) DEV/OPS: Diagnóstico de contexto (uid, empresa ativa, GUC, memberships)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.dev_empresa_context_diagnostics();
CREATE OR REPLACE FUNCTION public.dev_empresa_context_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := public.current_user_id();
  v_guc text := nullif(current_setting('app.current_empresa_id', true), '');
  v_current uuid := public.current_empresa_id();
  v_active uuid;
  v_memberships int := 0;
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_authenticated'
    );
  END IF;

  SELECT uae.empresa_id INTO v_active
  FROM public.user_active_empresa uae
  WHERE uae.user_id = v_uid
  LIMIT 1;

  SELECT COUNT(*) INTO v_memberships
  FROM public.empresa_usuarios eu
  WHERE eu.user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'guc_current_empresa_id', v_guc,
    'current_empresa_id', v_current,
    'user_active_empresa_id', v_active,
    'memberships_count', v_memberships,
    'now', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dev_empresa_context_diagnostics() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dev_empresa_context_diagnostics() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) OPS: Prova por IDs (empresa_id real dos produtos)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.ops_debug_produtos_empresa_ids(uuid[]);
CREATE OR REPLACE FUNCTION public.ops_debug_produtos_empresa_ids(p_ids uuid[])
RETURNS TABLE(id uuid, empresa_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.empresa_id
  FROM public.produtos p
  WHERE p.id = ANY(p_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_debug_produtos_empresa_ids(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_debug_produtos_empresa_ids(uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Hardening RLS: public.produtos (remover `to public` / policies duplicadas)
-- ---------------------------------------------------------------------------

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

-- Policies antigas/diferentes nomes (drift) — drop best-effort.
DROP POLICY IF EXISTS policy_select ON public.produtos;
DROP POLICY IF EXISTS policy_update ON public.produtos;
DROP POLICY IF EXISTS produtos_select ON public.produtos;
DROP POLICY IF EXISTS produtos_select_own_company ON public.produtos;
DROP POLICY IF EXISTS produtos_insert ON public.produtos;
DROP POLICY IF EXISTS produtos_insert_own_company ON public.produtos;
DROP POLICY IF EXISTS produtos_update ON public.produtos;
DROP POLICY IF EXISTS produtos_update_own_company ON public.produtos;
DROP POLICY IF EXISTS produtos_delete ON public.produtos;
DROP POLICY IF EXISTS produtos_delete_own_company ON public.produtos;

CREATE POLICY produtos_select_own_company
ON public.produtos
FOR SELECT
TO authenticated
USING (empresa_id = public.current_empresa_id());

CREATE POLICY produtos_insert_own_company
ON public.produtos
FOR INSERT
TO authenticated
WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY produtos_update_own_company
ON public.produtos
FOR UPDATE
TO authenticated
USING (empresa_id = public.current_empresa_id())
WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY produtos_delete_own_company
ON public.produtos
FOR DELETE
TO authenticated
USING (empresa_id = public.current_empresa_id());

-- Remover acesso de roles públicas onde possível (não quebra service_role).
REVOKE ALL ON TABLE public.produtos FROM anon;
REVOKE ALL ON TABLE public.produtos FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.produtos TO authenticated, service_role, postgres;

-- Recarrega schema cache do PostgREST.
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

