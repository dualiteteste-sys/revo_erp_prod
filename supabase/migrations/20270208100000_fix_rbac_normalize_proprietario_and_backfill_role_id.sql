/*
  Fix (RBAC): normalizar "Proprietário" e backfill de role_id

  Sintoma (DEV e PROD):
  - Usuário com papel "Proprietário" não consegue ver opções em "Papéis e Permissões"
    e "Permissões específicas" (catálogo parece vazio / sem opções para editar).

  Causa comum:
  - `empresa_usuarios.role` pode estar preenchido com valores legados/UX (ex.: "Proprietário")
    que não eram reconhecidos por `normalize_empresa_role()`, resultando em:
      - `current_empresa_role()` = NULL
      - `current_role_id()` = NULL
      - `has_permission_for_current_user()` => false para tudo

  Objetivo:
  - Reconhecer variações PT-BR de "Owner" via `normalize_empresa_role()`.
  - Tornar `current_role_id()` resiliente (fallback por normalize).
  - Backfill idempotente de `empresa_usuarios.role_id` quando estiver NULL.
*/

BEGIN;

-- 1) Normalização mais completa (PT-BR)
CREATE OR REPLACE FUNCTION public.normalize_empresa_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_role, '')))
    when 'owner' then 'owner'
    when 'dono' then 'owner'
    when 'proprietario' then 'owner'
    when 'proprietário' then 'owner'
    when 'proprietaria' then 'owner'
    when 'proprietária' then 'owner'

    when 'admin' then 'admin'
    when 'administrador' then 'admin'
    when 'administradora' then 'admin'

    when 'member' then 'member'
    when 'membro' then 'member'
    when 'ops' then 'member'
    when 'operador' then 'member'
    when 'operacoes' then 'member'
    when 'operações' then 'member'
    when 'finance' then 'member'
    when 'financeiro' then 'member'

    when 'readonly' then 'viewer'
    when 'read_only' then 'viewer'
    when 'read-only' then 'viewer'
    when 'viewer' then 'viewer'
    when 'leitura' then 'viewer'
    else null
  END;
$$;

REVOKE ALL ON FUNCTION public.normalize_empresa_role(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.normalize_empresa_role(text) TO authenticated, service_role, postgres;

-- 2) current_role_id: fallback por normalize (evita role NULL quando role_id ainda não foi backfillado)
CREATE OR REPLACE FUNCTION public.current_role_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT COALESCE(
    eu.role_id,
    r_norm.id,
    r_slug.id
  )
  FROM public.empresa_usuarios eu
  LEFT JOIN public.roles r_norm ON upper(r_norm.slug) = upper(public.normalize_empresa_role(eu.role))
  LEFT JOIN public.roles r_slug ON upper(r_slug.slug) = upper(eu.role)
  WHERE eu.user_id = public.current_user_id()
    AND eu.empresa_id = public.current_empresa_id()
  ORDER BY eu.created_at DESC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_role_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_role_id() TO authenticated, service_role;

-- 3) Backfill de role_id (idempotente)
DO $$
BEGIN
  IF to_regclass('public.empresa_usuarios') IS NULL OR to_regclass('public.roles') IS NULL THEN
    RETURN;
  END IF;

  WITH role_map AS (
    SELECT id, upper(slug) AS slug_u
    FROM public.roles
  )
  UPDATE public.empresa_usuarios eu
  SET role_id = rm.id
  FROM role_map rm
  WHERE eu.role_id IS NULL
    AND rm.slug_u = COALESCE(
      upper(public.normalize_empresa_role(eu.role)),
      upper(eu.role)
    );
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

