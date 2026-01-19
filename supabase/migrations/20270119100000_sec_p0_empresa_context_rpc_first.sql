/*
  P0.1 (multi-tenant boot determinístico): remover dependência do frontend em `supabase.from()`
  para obter:
  - lista de empresas do usuário
  - empresa ativa do usuário

  Motivo
  - leituras diretas de `empresa_usuarios` / `user_active_empresa` no boot podem oscilar com schema cache,
    grants/RLS e timing, gerando 403 intermitente e console sujo.

  Solução
  - RPC-first (SECURITY DEFINER) com filtro explícito por `auth.uid()` (sem depender de grants em tabela).
  - Retornos pequenos e determinísticos para serem usados no boot/contexto.
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- Empresas do usuário atual
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.empresas_list_for_current_user(int);
CREATE OR REPLACE FUNCTION public.empresas_list_for_current_user(p_limit int DEFAULT 50)
RETURNS SETOF public.empresas
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT e.*
  FROM public.empresa_usuarios eu
  JOIN public.empresas e
    ON e.id = eu.empresa_id
  WHERE eu.user_id = auth.uid()
  ORDER BY eu.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.empresas_list_for_current_user(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresas_list_for_current_user(int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Empresa ativa do usuário atual
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.active_empresa_get_for_current_user();
CREATE OR REPLACE FUNCTION public.active_empresa_get_for_current_user()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT uae.empresa_id
  FROM public.user_active_empresa uae
  WHERE uae.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.active_empresa_get_for_current_user() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.active_empresa_get_for_current_user() TO authenticated, service_role;

COMMIT;

