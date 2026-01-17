/*
  P1.2 (RPC-first): RBAC — Papéis e Permissões
  - Remove acesso direto do client às tabelas `roles`, `permissions`, `role_permissions`.
  - Centraliza em RPCs SECURITY DEFINER com enforcement `roles:manage`.
  - Atualizações atômicas (delete + insert) para evitar estado parcial.
*/

BEGIN;

-- Lista papéis
DROP FUNCTION IF EXISTS public.roles_list();
CREATE OR REPLACE FUNCTION public.roles_list()
RETURNS SETOF public.roles
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT r.*
  FROM public.roles r
  WHERE (public.require_permission_for_current_user('roles','manage') IS NULL)
  ORDER BY r.precedence ASC;
$$;

-- Lista permissões
DROP FUNCTION IF EXISTS public.roles_permissions_list();
CREATE OR REPLACE FUNCTION public.roles_permissions_list()
RETURNS SETOF public.permissions
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.*
  FROM public.permissions p
  WHERE (public.require_permission_for_current_user('roles','manage') IS NULL)
  ORDER BY p.module ASC, p.action ASC;
$$;

-- Lista permissões de um papel
DROP FUNCTION IF EXISTS public.roles_role_permissions_list(uuid);
CREATE OR REPLACE FUNCTION public.roles_role_permissions_list(p_role_id uuid)
RETURNS SETOF public.role_permissions
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT rp.*
  FROM public.role_permissions rp
  WHERE (public.require_permission_for_current_user('roles','manage') IS NULL)
    AND rp.role_id = p_role_id;
$$;

-- Atualiza permissões de um papel (atômico)
DROP FUNCTION IF EXISTS public.roles_update_role_permissions(uuid, uuid[], uuid[]);
CREATE OR REPLACE FUNCTION public.roles_update_role_permissions(
  p_role_id uuid,
  p_add_permission_ids uuid[] DEFAULT NULL,
  p_remove_permission_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(added_count int, removed_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_added int := 0;
  v_removed int := 0;
BEGIN
  PERFORM public.require_permission_for_current_user('roles','manage');

  IF p_role_id IS NULL THEN
    RAISE EXCEPTION 'role_id é obrigatório.' USING errcode = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.id = p_role_id) THEN
    RAISE EXCEPTION 'Papel não encontrado.' USING errcode = 'P0001';
  END IF;

  IF p_remove_permission_ids IS NOT NULL AND array_length(p_remove_permission_ids, 1) > 0 THEN
    DELETE FROM public.role_permissions rp
    WHERE rp.role_id = p_role_id
      AND rp.permission_id = ANY(p_remove_permission_ids);
    GET DIAGNOSTICS v_removed = ROW_COUNT;
  END IF;

  IF p_add_permission_ids IS NOT NULL AND array_length(p_add_permission_ids, 1) > 0 THEN
    INSERT INTO public.role_permissions(role_id, permission_id)
    SELECT p_role_id, x
    FROM unnest(p_add_permission_ids) x
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_added, v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.roles_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.roles_list() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.roles_permissions_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.roles_permissions_list() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.roles_role_permissions_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.roles_role_permissions_list(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.roles_update_role_permissions(uuid, uuid[], uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.roles_update_role_permissions(uuid, uuid[], uuid[]) TO authenticated, service_role;

COMMIT;

