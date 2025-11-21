/*
# [Fix &amp; Feature] Adiciona status a empresa_usuarios e corrige RPCs
- Adiciona a coluna `status` à tabela `empresa_usuarios` para rastrear o estado do usuário (ativo, pendente, inativo).
- Faz o backfill do status para 'ACTIVE' para usuários existentes que já fizeram login.
- Corrige a função `list_users_for_current_empresa` para incluir a nova coluna `status`.
- Adiciona as funções `deactivate_user_for_current_empresa` e `reactivate_user_for_current_empresa` para gerenciar o status.
*/
-- 1) Criar o tipo ENUM para o status do usuário na empresa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_in_empresa') THEN
    CREATE TYPE public.user_status_in_empresa AS ENUM ('ACTIVE', 'PENDING', 'INACTIVE');
  END IF;
END
$$;
-- 2) Adicionar a coluna 'status' à tabela 'empresa_usuarios'
ALTER TABLE public.empresa_usuarios
ADD COLUMN IF NOT EXISTS status public.user_status_in_empresa NOT NULL DEFAULT 'PENDING';
COMMENT ON COLUMN public.empresa_usuarios.status IS 'Status do usuário na empresa: PENDING (convidado), ACTIVE (ativo), INACTIVE (desativado pelo admin).';
-- 3) Backfill: Marcar usuários existentes como ATIVOS se já fizeram login
UPDATE public.empresa_usuarios eu
SET status = 'ACTIVE'
FROM auth.users u
WHERE eu.user_id = u.id
  AND u.last_sign_in_at IS NOT NULL
  AND eu.status = 'PENDING';
-- 4) Corrigir a função de listagem de usuários para incluir o status
DROP FUNCTION IF EXISTS public.list_users_for_current_empresa(text,text[],text[],integer,text);
CREATE OR REPLACE FUNCTION public.list_users_for_current_empresa(
    p_q text DEFAULT NULL,
    p_role text[] DEFAULT NULL,
    p_status text[] DEFAULT NULL,
    p_limit integer DEFAULT 20,
    p_after text DEFAULT NULL
  ) RETURNS TABLE(
    user_id uuid,
    email text,
    name text,
    role text,
    status text,
    invited_at timestamptz,
    last_sign_in_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
  ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,
  public STABLE AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_after_ts timestamptz;
BEGIN
  IF p_after IS NOT NULL THEN
    v_after_ts := p_after::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    eu.user_id,
    u.email,
    u.raw_user_meta_data ->> 'name' AS name,
    r.slug AS role,
    eu.status::text,
    eu.created_at AS invited_at,
    u.last_sign_in_at,
    u.created_at,
    u.updated_at
  FROM
    public.empresa_usuarios eu
    JOIN auth.users u ON eu.user_id = u.id
    LEFT JOIN public.roles r ON eu.role_id = r.id
  WHERE
    eu.empresa_id = v_empresa_id
    AND (p_q IS NULL OR (
      u.email ILIKE '%' || p_q || '%' OR
      (u.raw_user_meta_data->>'name') ILIKE '%' || p_q || '%'
    ))
    AND (p_role IS NULL OR r.slug = ANY(p_role))
    AND (p_status IS NULL OR eu.status::text = ANY(p_status))
    AND (v_after_ts IS NULL OR eu.created_at < v_after_ts)
  ORDER BY
    eu.created_at DESC
  LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_users_for_current_empresa(text, text[], text[], integer, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_users_for_current_empresa(text, text[], text[], integer, text) TO authenticated,
  service_role;
-- 5) Adicionar funções para gerenciar o status do usuário
CREATE OR REPLACE FUNCTION public.deactivate_user_for_current_empresa(p_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,
  public AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_target_user_role_slug text;
BEGIN
  -- Check if current user has permission to manage users
  IF NOT public.has_permission_for_current_user('usuarios', 'manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Você não tem permissão para gerenciar usuários.';
  END IF;
  
  SELECT r.slug INTO v_target_user_role_slug
  FROM public.empresa_usuarios eu
  JOIN public.roles r ON eu.role_id = r.id
  WHERE eu.user_id = p_user_id AND eu.empresa_id = v_empresa_id;

  -- Prevent deactivating the owner
  IF v_target_user_role_slug = 'OWNER' THEN
      RAISE EXCEPTION 'ACTION_NOT_ALLOWED: Não é possível desativar o proprietário da empresa.';
  END IF;

  UPDATE public.empresa_usuarios
  SET status = 'INACTIVE'
  WHERE user_id = p_user_id AND empresa_id = v_empresa_id;
END;
$$;
REVOKE ALL ON FUNCTION public.deactivate_user_for_current_empresa(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_user_for_current_empresa(uuid) TO authenticated,
  service_role;
CREATE OR REPLACE FUNCTION public.reactivate_user_for_current_empresa(p_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,
  public AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  -- Check if current user has permission to manage users
  IF NOT public.has_permission_for_current_user('usuarios', 'manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Você não tem permissão para gerenciar usuários.';
  END IF;

  UPDATE public.empresa_usuarios
  SET status = 'ACTIVE'
  WHERE user_id = p_user_id AND empresa_id = v_empresa_id AND status = 'INACTIVE';
END;
$$;
REVOKE ALL ON FUNCTION public.reactivate_user_for_current_empresa(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_user_for_current_empresa(uuid) TO authenticated,
  service_role;
