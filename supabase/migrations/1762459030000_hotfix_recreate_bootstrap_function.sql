-- =============================================================================
-- Hotfix: Drop explícito + Create da função bootstrap_empresa_for_current_user
-- Motivo: 42P13 (não pode renomear parâmetro com CREATE OR REPLACE)
-- Ação: DROP IF EXISTS da assinatura exata + CREATE (sem OR REPLACE), grants, cache
-- =============================================================================

-- 0) DROP incondicional da assinatura exata
DROP FUNCTION IF EXISTS public.bootstrap_empresa_for_current_user(text, text);

-- 1) CREATE (sem OR REPLACE) com corpo corrigido e padrões do projeto
CREATE FUNCTION public.bootstrap_empresa_for_current_user(
    p_razao_social text DEFAULT NULL,
    p_fantasia     text DEFAULT NULL
)
RETURNS TABLE(empresa_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog','public'
AS $$
DECLARE
    v_user_id    uuid := public.current_user_id();
    v_empresa_id uuid;
    v_user_meta  jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthenticated';
    END IF;

    -- 1) Já possui empresa ativa?
    SELECT uae.empresa_id
      INTO v_empresa_id
      FROM public.user_active_empresa uae
     WHERE uae.user_id = v_user_id
     LIMIT 1;

    IF v_empresa_id IS NOT NULL THEN
        RETURN QUERY SELECT v_empresa_id, 'already_active'::text;
        RETURN;
    END IF;

    -- 2) É membro de alguma empresa?
    SELECT eu.empresa_id
      INTO v_empresa_id
      FROM public.empresa_usuarios eu
     WHERE eu.user_id = v_user_id
     LIMIT 1;

    IF v_empresa_id IS NOT NULL THEN
        -- Define como ativa
        INSERT INTO public.user_active_empresa (user_id, empresa_id)
        VALUES (v_user_id, v_empresa_id)
        ON CONFLICT (user_id)
        DO UPDATE SET empresa_id = EXCLUDED.empresa_id, updated_at = now();

        RETURN QUERY SELECT v_empresa_id, 'activated_existing'::text;
        RETURN;
    END IF;

    -- 3) Criar empresa nova
    SELECT u.raw_user_meta_data
      INTO v_user_meta
      FROM auth.users u
     WHERE u.id = v_user_id;

    -- (Opcional) Exemplo de checagem jsonb segura:
    -- IF v_user_meta ? 'needs_onboarding'::text THEN
    --   -- lógica opcional
    -- END IF;

    INSERT INTO public.empresas (razao_social, fantasia)
    VALUES (
        COALESCE(p_razao_social, 'Minha Empresa'),
        COALESCE(p_fantasia, p_razao_social, 'Minha Empresa')
    )
    RETURNING id INTO v_empresa_id;

    -- Vincula usuário à empresa
    INSERT INTO public.empresa_usuarios (empresa_id, user_id)
    VALUES (v_empresa_id, v_user_id)
    ON CONFLICT DO NOTHING;

    -- Ativa a empresa
    INSERT INTO public.user_active_empresa (user_id, empresa_id)
    VALUES (v_user_id, v_empresa_id)
    ON CONFLICT (user_id)
    DO UPDATE SET empresa_id = EXCLUDED.empresa_id, updated_at = now();

    RETURN QUERY SELECT v_empresa_id, 'created_new'::text;
END
$$;

-- 2) Grants (PUBLIC não)
REVOKE ALL ON FUNCTION public.bootstrap_empresa_for_current_user(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.bootstrap_empresa_for_current_user(text, text)
   TO authenticated, service_role;

-- 3) Atualizar cache do PostgREST
SELECT pg_notify('pgrst','reload schema');
