-- Fix: current_empresa_role precisava considerar `empresa_usuarios.role_id` (legado),
-- pois o bootstrap antigo setava apenas role_id (OWNER/ADMIN) e `role` (texto) ficava como 'member'.
-- Sintoma: UI sem acesso a recursos de admin (ex.: Configurar QA) mesmo sendo "super admin".

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

  -- Preferimos a coluna nova `role` quando válida; senão, caímos no legado `roles.slug`.
  RETURN public.normalize_empresa_role(COALESCE(v_role_text, lower(v_role_slug)));
END;
$$;

REVOKE ALL ON FUNCTION public.current_empresa_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_empresa_role() TO authenticated, service_role, postgres;

COMMIT;

