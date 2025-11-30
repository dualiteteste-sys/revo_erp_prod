-- =====================================================================
-- RPC: public.list_users_for_current_empresa
-- Descrição: Cria a função para listar usuários da empresa atual, com filtros e paginação.
--
-- Impacto:
--   - Segurança: SECURITY DEFINER, usa RLS implícito via current_empresa_id(). Seguro.
--   - Compatibilidade: Adiciona uma nova função. Não quebra nada existente.
--   - Reversibilidade: Reversível via DROP FUNCTION.
--   - Performance: Usa joins e filtros condicionais. Índices em empresa_id, user_id, role_id são recomendados.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.list_users_for_current_empresa(
    p_q TEXT DEFAULT NULL,
    p_role TEXT[] DEFAULT NULL,
    p_status TEXT[] DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_after TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID,
    email TEXT,
    name TEXT,
    role TEXT,
    status TEXT,
    invited_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id UUID := public.current_empresa_id();
BEGIN
  PERFORM pg_notify('app_log', '[RPC][LIST_USERS] Buscando usuários para empresa ' || v_empresa_id);

  RETURN QUERY
  SELECT
    eu.user_id,
    u.email,
    u.raw_user_meta_data->>'name' AS name,
    r.slug::TEXT AS role,
    eu.status::TEXT,
    u.invited_at,
    u.last_sign_in_at,
    eu.created_at,
    eu.updated_at
  FROM
    public.empresa_usuarios eu
  JOIN
    auth.users u ON eu.user_id = u.id
  LEFT JOIN
    public.roles r ON eu.role_id = r.id
  WHERE
    eu.empresa_id = v_empresa_id
    AND (p_q IS NULL OR u.email ILIKE '%' || p_q || '%' OR (u.raw_user_meta_data->>'name') ILIKE '%' || p_q || '%')
    AND (p_role IS NULL OR r.slug = ANY(p_role))
    AND (p_status IS NULL OR eu.status = ANY(p_status))
    AND (p_after IS NULL OR eu.updated_at < p_after)
  ORDER BY
    eu.updated_at DESC,
    eu.user_id DESC
  LIMIT
    LEAST(p_limit, 100);
END;
$$;

-- Aplica permissões de execução
REVOKE ALL ON FUNCTION public.list_users_for_current_empresa(TEXT, TEXT[], TEXT[], INT, TIMESTAMPTZ) FROM public;
GRANT EXECUTE ON FUNCTION public.list_users_for_current_empresa(TEXT, TEXT[], TEXT[], INT, TIMESTAMPTZ) TO authenticated, service_role;

-- Notifica o PostgREST para recarregar o schema
SELECT pg_notify('pgrst', 'reload schema');
