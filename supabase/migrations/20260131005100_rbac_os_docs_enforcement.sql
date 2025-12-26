/*
  RBAC: enforcement para OS Docs
  - os_docs_list: exige os:view
  - os_doc_register / os_doc_delete: exige os:update
*/

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.os_docs_list(uuid)') IS NOT NULL
     AND to_regprocedure('public.os_docs_list__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.os_docs_list(uuid) RENAME TO os_docs_list__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.os_docs_list(p_os_id uuid)
RETURNS TABLE (
  id uuid,
  titulo text,
  descricao text,
  arquivo_path text,
  tamanho_bytes bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os', 'view');
  RETURN QUERY SELECT * FROM public.os_docs_list__unsafe(p_os_id);
END;
$$;

REVOKE ALL ON FUNCTION public.os_docs_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.os_docs_list(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.os_doc_register(uuid, text, text, text, bigint)') IS NOT NULL
     AND to_regprocedure('public.os_doc_register__unsafe(uuid, text, text, text, bigint)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.os_doc_register(uuid, text, text, text, bigint) RENAME TO os_doc_register__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.os_doc_register(
  p_os_id uuid,
  p_titulo text,
  p_arquivo_path text,
  p_descricao text DEFAULT NULL,
  p_tamanho_bytes bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os', 'update');
  RETURN public.os_doc_register__unsafe(p_os_id, p_titulo, p_arquivo_path, p_descricao, p_tamanho_bytes);
END;
$$;

REVOKE ALL ON FUNCTION public.os_doc_register(uuid, text, text, text, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.os_doc_register(uuid, text, text, text, bigint) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.os_doc_delete(uuid)') IS NOT NULL
     AND to_regprocedure('public.os_doc_delete__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.os_doc_delete(uuid) RENAME TO os_doc_delete__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.os_doc_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os', 'update');
  PERFORM public.os_doc_delete__unsafe(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.os_doc_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.os_doc_delete(uuid) TO authenticated, service_role;

COMMIT;

