-- =============================================================================
-- Migração: Funções de contexto (user/empresa) com fallback de claims
-- Data: 2025-11-08
-- Padrões: SECURITY INVOKER, search_path = 'pg_catalog','public'
-- Notas:
--  - Em SQL Editor (sem JWT), ambas retornarão NULL (comportamento esperado).
--  - Em chamadas via PostgREST/Frontend autenticadas, irão resolver corretamente.
-- =============================================================================

/*
          # [Operation Name]
          Atualização das Funções de Contexto de Usuário e Empresa

          ## Query Description: [Esta operação substitui as funções `current_user_id()` e `current_empresa_id()` para garantir a correta identificação do usuário e sua empresa ativa a partir do token JWT. A mudança principal adiciona um fallback para ler o `sub` do JWT em diferentes formatos, resolvendo um problema de compatibilidade com o PostgREST. Também cria um índice para otimizar a busca da empresa ativa. Esta alteração não afeta dados existentes e é segura de ser aplicada.]
          
          ## Metadata:
          - Schema-Category: "Structural"
          - Impact-Level: "Low"
          - Requires-Backup: false
          - Reversible: true
          
          ## Structure Details:
          - Functions Modified: `public.current_user_id()`, `public.current_empresa_id()`
          - Indexes Added: `idx_user_active_empresa__user_updated_at` on `public.user_active_empresa`
          
          ## Security Implications:
          - RLS Status: Aprimorado
          - Policy Changes: Não
          - Auth Requirements: A correção melhora a aplicação de RLS que dependem destas funções.
          
          ## Performance Impact:
          - Indexes: Adiciona um índice para otimizar a busca da empresa ativa, melhorando a performance de queries que dependem de `current_empresa_id()`.
          - Triggers: Nenhum
          - Estimated Impact: Positivo. A resolução de contexto será mais rápida e confiável.
          */

-- 1) current_user_id(): lê sub do JWT em dois formatos suportados pelo PostgREST
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'pg_catalog','public'
AS $$
DECLARE
  v_sub_text text;
  v_claims   json;
BEGIN
  -- Formato 1: request.jwt.claim.sub (string direta)
  BEGIN
    v_sub_text := NULLIF(current_setting('request.jwt.claim.sub', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_sub_text := NULL;
  END;

  IF v_sub_text IS NOT NULL THEN
    RETURN v_sub_text::uuid;
  END IF;

  -- Formato 2: request.jwt.claims (json) -> 'sub'
  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::json;
  EXCEPTION WHEN OTHERS THEN
    v_claims := NULL;
  END;

  IF v_claims ? 'sub' THEN
    RETURN (v_claims->>'sub')::uuid;
  END IF;

  RETURN NULL; -- sem JWT (ex.: SQL Editor) ou token malformado
END
$$;

COMMENT ON FUNCTION public.current_user_id() IS
  'Retorna o UUID do usuário a partir do JWT (request.jwt.claim.sub ou claims->>sub). Em SQL Editor (sem JWT) retorna NULL.';

-- 2) current_empresa_id(): pega a empresa “ativa” mais recente do usuário
CREATE OR REPLACE FUNCTION public.current_empresa_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'pg_catalog','public'
AS $$
DECLARE
  v_uid uuid := public.current_user_id();
  v_emp uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL; -- sem usuário resolvido (ex.: SQL Editor)
  END IF;

  -- Seleciona a empresa ativa mais recente (user_active_empresa possui updated_at)
  SELECT uae.empresa_id
  INTO v_emp
  FROM public.user_active_empresa uae
  WHERE uae.user_id = v_uid
  ORDER BY uae.updated_at DESC NULLS LAST, uae.empresa_id
  LIMIT 1;

  RETURN v_emp;
END
$$;

COMMENT ON FUNCTION public.current_empresa_id() IS
  'Retorna a empresa ativa do usuário (a mais recente em user_active_empresa). Depende de current_user_id().';

-- 3) Índice auxiliar para resolver empresa ativa com eficiência
--    (idempotente: só cria se não existir exatamente esse índice)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_user_active_empresa__user_updated_at'
  ) THEN
    CREATE INDEX idx_user_active_empresa__user_updated_at
      ON public.user_active_empresa (user_id, updated_at DESC);
  END IF;
END
$$ LANGUAGE plpgsql;

-- 4) Telemetria
SELECT pg_notify('pgrst','reload schema');
SELECT pg_notify('app_log','[CTX] current_user_id/current_empresa_id atualizadas + índice em user_active_empresa');
