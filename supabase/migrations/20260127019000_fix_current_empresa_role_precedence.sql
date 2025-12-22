-- Fix: current_empresa_role deve considerar a maior permissão entre `empresa_usuarios.role` (texto) e `role_id` (legado).
-- Caso clássico: bootstrap antigo setou role_id=OWNER, mas `role` ficou como 'member' (default) => UI bloqueava recursos de admin/owner (ex.: Configurar QA).

BEGIN;

CREATE OR REPLACE FUNCTION public.current_empresa_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp uuid := public.current_empresa_id();
  v_role_text text;
  v_role_slug text;
  v_norm_text text;
  v_norm_slug text;
BEGIN
  IF public.is_service_role() THEN
    RETURN 'owner';
  END IF;

  IF v_uid IS NULL OR v_emp IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT eu.role, r.slug
    INTO v_role_text, v_role_slug
    FROM public.empresa_usuarios eu
    LEFT JOIN public.roles r ON r.id = eu.role_id
   WHERE eu.empresa_id = v_emp
     AND eu.user_id = v_uid
   LIMIT 1;

  v_norm_text := public.normalize_empresa_role(v_role_text);
  v_norm_slug := public.normalize_empresa_role(lower(v_role_slug));

  -- Retorna o maior nível (owner > admin > member > viewer)
  IF public.empresa_role_rank(v_norm_slug) > public.empresa_role_rank(v_norm_text) THEN
    RETURN v_norm_slug;
  END IF;
  RETURN v_norm_text;
END;
$$;

REVOKE ALL ON FUNCTION public.current_empresa_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_empresa_role() TO authenticated, service_role, postgres;

COMMIT;

