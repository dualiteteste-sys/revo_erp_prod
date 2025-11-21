/*
[Fix &amp; Feature] empresa_usuarios.status + RPCs (idempotente, seguro)
- ENUM public.user_status_in_empresa: ('ACTIVE','PENDING','INACTIVE')
- Coluna status em public.empresa_usuarios (DEFAULT 'PENDING')
- Backfill: usuários com login já realizado -> 'ACTIVE'
- Índice para filtro: (empresa_id, status)
- RPC list_users_for_current_empresa: inclui status e usa auth.users.invited_at
- RPCs de ativação/desativação com checagem RBAC ('usuarios','manage')
- SD + search_path fixo; limites e keyset
*/

-- 0) Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_in_empresa') THEN
    CREATE TYPE public.user_status_in_empresa AS ENUM ('ACTIVE','PENDING','INACTIVE');
  END IF;
END
$$;

-- 1) Coluna status em empresa_usuarios
ALTER TABLE public.empresa_usuarios
  ADD COLUMN IF NOT EXISTS status public.user_status_in_empresa NOT NULL DEFAULT 'PENDING';

COMMENT ON COLUMN public.empresa_usuarios.status
  IS 'Status do usuário na empresa: PENDING (convidado), ACTIVE (ativo), INACTIVE (desativado pelo admin).';

-- 2) Backfill seguro: marcar ACTIVE quem já fez login
UPDATE public.empresa_usuarios eu
SET status = 'ACTIVE'
FROM auth.users u
WHERE eu.user_id = u.id
  AND u.last_sign_in_at IS NOT NULL
  AND eu.status = 'PENDING';

-- 3) Índice para filtros/paginação
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios__empresa_status
  ON public.empresa_usuarios(empresa_id, status);

-- 4) RPC: listagem de usuários
-- (derruba versões antigas por assinatura, se existirem)
DROP FUNCTION IF EXISTS public.list_users_for_current_empresa(text,text[],text[],integer,text);
DROP FUNCTION IF EXISTS public.list_users_for_current_empresa(text,text[],text[],integer,timestamptz);

CREATE OR REPLACE FUNCTION public.list_users_for_current_empresa(
  p_q      text        DEFAULT NULL,
  p_role   text[]      DEFAULT NULL,   -- slugs (OWNER/ADMIN/...)
  p_status text[]      DEFAULT NULL,   -- 'PENDING' | 'ACTIVE' | 'INACTIVE'
  p_limit  int         DEFAULT 20,
  p_after  text        DEFAULT NULL    -- ISO string; parse p/ timestamptz
)
RETURNS TABLE(
  user_id uuid,
  email text,
  name text,
  role text,
  status text,
  invited_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_after_ts   timestamptz;
BEGIN
  IF p_after IS NOT NULL THEN
    v_after_ts := p_after::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    eu.user_id,
    u.email,
    (u.raw_user_meta_data->>'name') AS name,
    r.slug::text AS role,
    eu.status::text AS status,
    u.invited_at,              -- convite real (não confundir com vínculo)
    u.last_sign_in_at,
    u.created_at,
    u.updated_at
  FROM public.empresa_usuarios eu
  JOIN auth.users u        ON u.id = eu.user_id
  LEFT JOIN public.roles r ON r.id = eu.role_id
  WHERE eu.empresa_id = v_empresa_id
    AND (p_q IS NULL OR u.email ILIKE '%'||p_q||'%' OR (u.raw_user_meta_data->>'name') ILIKE '%'||p_q||'%')
    AND (p_role   IS NULL OR r.slug = ANY(p_role))
    AND (p_status IS NULL OR eu.status::text = ANY(p_status))
    AND (v_after_ts IS NULL OR eu.created_at < v_after_ts) -- keyset
  ORDER BY eu.created_at DESC, eu.user_id DESC
  LIMIT LEAST(COALESCE(p_limit,20), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.list_users_for_current_empresa(text,text[],text[],int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_users_for_current_empresa(text,text[],text[],int,text) TO authenticated, service_role;

-- 5) RPC: desativar usuário
CREATE OR REPLACE FUNCTION public.deactivate_user_for_current_empresa(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_target_role text;
BEGIN
  IF NOT public.has_permission_for_current_user('usuarios','manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Você não tem permissão para gerenciar usuários.';
  END IF;

  SELECT r.slug INTO v_target_role
  FROM public.empresa_usuarios eu
  LEFT JOIN public.roles r ON r.id = eu.role_id
  WHERE eu.user_id = p_user_id AND eu.empresa_id = v_empresa_id;

  IF v_target_role = 'OWNER' THEN
    RAISE EXCEPTION 'ACTION_NOT_ALLOWED: Não é possível desativar o proprietário da empresa.';
  END IF;

  UPDATE public.empresa_usuarios
     SET status = 'INACTIVE'
   WHERE user_id = p_user_id
     AND empresa_id = v_empresa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_user_for_current_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_user_for_current_empresa(uuid) TO authenticated, service_role;

-- 6) RPC: reativar usuário
CREATE OR REPLACE FUNCTION public.reactivate_user_for_current_empresa(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  IF NOT public.has_permission_for_current_user('usuarios','manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Você não tem permissão para gerenciar usuários.';
  END IF;

  UPDATE public.empresa_usuarios
     SET status = 'ACTIVE'
   WHERE user_id = p_user_id
     AND empresa_id = v_empresa_id
     AND status = 'INACTIVE';
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_user_for_current_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_user_for_current_empresa(uuid) TO authenticated, service_role;

-- 7) PostgREST: recarregar schema
SELECT pg_notify('pgrst','reload schema');
