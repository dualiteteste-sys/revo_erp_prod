/*
  Fix (RBAC): hardening nas RPCs de leitura de papéis/permissões

  Sintoma observado:
  - Em alguns ambientes, a UI de "Papéis e Permissões" recebe lista vazia mesmo com catálogo RBAC existente.

  Ajuste:
  - Troca as funções SQL com cláusula `WHERE require_permission... IS NULL`
    por PL/pgSQL com `PERFORM require_permission...` explícito.
  - Mantém contrato de retorno (SETOF) e grants existentes.

  Segurança:
  - Continua exigindo `roles/manage` para listar catálogo RBAC.
  - Não amplia grants de tabela nem bypass de tenant.
*/

BEGIN;

DROP FUNCTION IF EXISTS public.roles_list();
CREATE OR REPLACE FUNCTION public.roles_list()
RETURNS SETOF public.roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('roles', 'manage');

  RETURN QUERY
  SELECT r.*
  FROM public.roles r
  ORDER BY r.precedence ASC;
END;
$$;

DROP FUNCTION IF EXISTS public.roles_permissions_list();
CREATE OR REPLACE FUNCTION public.roles_permissions_list()
RETURNS SETOF public.permissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('roles', 'manage');

  RETURN QUERY
  SELECT p.*
  FROM public.permissions p
  ORDER BY p.module ASC, p.action ASC;
END;
$$;

DROP FUNCTION IF EXISTS public.roles_role_permissions_list(uuid);
CREATE OR REPLACE FUNCTION public.roles_role_permissions_list(p_role_id uuid)
RETURNS SETOF public.role_permissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('roles', 'manage');

  RETURN QUERY
  SELECT rp.*
  FROM public.role_permissions rp
  WHERE rp.role_id = p_role_id;
END;
$$;

REVOKE ALL ON FUNCTION public.roles_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.roles_list() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.roles_permissions_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.roles_permissions_list() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.roles_role_permissions_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.roles_role_permissions_list(uuid) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
