/*
  HOTFIX: evitar 403 indevido em planos não-indústria (ex.: PRO) em RPCs core.

  Root cause (PROD):
  - `public.assert_empresa_role_at_least()` fazia `require_plano_mvp_allows('industria')`,
    então QUALQUER RPC que chamasse o assert acabava exigindo plano indústria.
  - Isso bloqueia inclusive RPCs core como:
    - public.empresa_features_get()
    - public.empresa_entitlements_get_for_current_empresa()

  Fix:
  1) Remover o check de plano de dentro do assert de role (deve validar apenas RBAC).
  2) Aplicar check de plano no guard de permissões por módulo:
     - módulos industriais => require_plano_mvp_allows('industria')
     - (serviços já fazem enforcement direto nos RPCs críticos via require_plano_mvp_allows('servicos'))

  IMPORTANT: qualquer mudança no Supabase deve virar migration.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) assert_empresa_role_at_least: RBAC only (sem enforcement de plano)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_empresa_role_at_least(p_min_role text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
  v_have int;
  v_need int;
  v_jwt_role text := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''));
BEGIN
  IF v_jwt_role = 'service_role' THEN
    RETURN;
  END IF;

  v_role := public.current_empresa_role();
  v_have := public.empresa_role_rank(v_role);
  v_need := public.empresa_role_rank(p_min_role);

  IF v_need <= 0 THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Configuração inválida de permissão (role mínima).';
  END IF;

  IF v_have < v_need THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = format('Sem permissão para executar esta ação (necessário: %s).', p_min_role);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_empresa_role_at_least(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assert_empresa_role_at_least(text) TO authenticated, service_role, postgres;

-- -----------------------------------------------------------------------------
-- 2) require_permission_for_current_user: adiciona enforcement de plano por módulo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_permission_for_current_user(p_module text, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Enforce plano (somente quando o módulo é do domínio Indústria).
  -- Mantém o comportamento atual para módulos comuns e para Serviços (já tem enforcement nos RPCs críticos).
  IF p_module = ANY (ARRAY['industria','qualidade','logistica','mrp']::text[]) THEN
    PERFORM public.require_plano_mvp_allows('industria');
  END IF;

  IF NOT public.has_permission_for_current_user(p_module, p_action) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para %/% nesta empresa.', p_module, p_action
      USING errcode = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.require_permission_for_current_user(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.require_permission_for_current_user(text, text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

