/*
# [FIX] RPCs para Gerenciamento de Usuários
Corrige a assinatura e implementação das funções `list_users_for_current_empresa` e `count_users_for_current_empresa` para alinhar com as chamadas do frontend.

## Query Description: 
Esta operação recria duas funções no banco de dados. Não há impacto em dados existentes. A correção é necessária para que a página de gerenciamento de usuários funcione corretamente.

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Low"]
- Requires-Backup: false
- Reversible: true (a versão anterior pode ser restaurada de um backup de migração)

## Structure Details:
- Funções afetadas:
  - `public.list_users_for_current_empresa`
  - `public.count_users_for_current_empresa`

## Security Implications:
- RLS Status: N/A (Funções)
- Policy Changes: No
- Auth Requirements: As funções são `SECURITY DEFINER` e usam `current_empresa_id()` para garantir o isolamento de tenant. O acesso é concedido ao role `authenticated`.

## Performance Impact:
- Indexes: Nenhum índice novo é adicionado. A performance depende dos índices existentes em `empresa_usuarios(empresa_id)` e `auth.users(id)`.
- Triggers: N/A
- Estimated Impact: Baixo. As queries são eficientes para tenants de tamanho médio.
*/

-- Dropa as funções antigas para garantir uma recriação limpa
DROP FUNCTION IF EXISTS public.list_users_for_current_empresa(text, text[], text[], integer, integer);
DROP FUNCTION IF EXISTS public.count_users_for_current_empresa(text, text[], text[]);

-- Função para listar usuários com paginação e filtros
CREATE OR REPLACE FUNCTION public.list_users_for_current_empresa(
    p_search TEXT DEFAULT NULL,
    p_roles TEXT[] DEFAULT NULL,
    p_status TEXT[] DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    name TEXT,
    role TEXT,
    status TEXT,
    invited_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        au.id AS user_id,
        au.email,
        au.raw_user_meta_data->>'name' AS name,
        r.slug AS role,
        eu.status::TEXT,
        au.invited_at,
        au.last_sign_in_at
    FROM
        public.empresa_usuarios eu
    JOIN
        auth.users au ON eu.user_id = au.id
    JOIN
        public.roles r ON eu.role_id = r.id
    WHERE
        eu.empresa_id = public.current_empresa_id()
        AND (p_search IS NULL OR au.email ILIKE '%' || p_search || '%' OR (au.raw_user_meta_data->>'name') ILIKE '%' || p_search || '%')
        AND (p_roles IS NULL OR r.slug = ANY(p_roles))
        AND (p_status IS NULL OR eu.status::TEXT = ANY(p_status))
    ORDER BY
        au.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Função para contar usuários com filtros
CREATE OR REPLACE FUNCTION public.count_users_for_current_empresa(
    p_search TEXT DEFAULT NULL,
    p_roles TEXT[] DEFAULT NULL,
    p_status TEXT[] DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT
        count(*)
    INTO
        v_count
    FROM
        public.empresa_usuarios eu
    JOIN
        auth.users au ON eu.user_id = au.id
    JOIN
        public.roles r ON eu.role_id = r.id
    WHERE
        eu.empresa_id = public.current_empresa_id()
        AND (p_search IS NULL OR au.email ILIKE '%' || p_search || '%' OR (au.raw_user_meta_data->>'name') ILIKE '%' || p_search || '%')
        AND (p_roles IS NULL OR r.slug = ANY(p_roles))
        AND (p_status IS NULL OR eu.status::TEXT = ANY(p_status));

    RETURN v_count;
END;
$$;

-- Permissões
REVOKE ALL ON FUNCTION public.list_users_for_current_empresa(text, text[], text[], integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.list_users_for_current_empresa(text, text[], text[], integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.count_users_for_current_empresa(text, text[], text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.count_users_for_current_empresa(text, text[], text[]) TO authenticated;
