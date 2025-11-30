-- =============================================================================
-- Migração: Adicionar RLS para tabelas de sistema (empresa_addons, user_active_empresa)
-- Data: 2025-11-07
-- Objetivos:
-- - Resolver o aviso "RLS Enabled No Policy" para tabelas restantes.
-- - Garantir que usuários só vejam add-ons de suas empresas.
-- - Garantir que usuários só gerenciem sua própria empresa ativa.
-- =============================================================================

-- =========================
-- EMPRESA_ADDONS
-- =========================
-- Descrição: Permite que usuários vejam os add-ons das empresas das quais são membros.
-- Mutações (INSERT/UPDATE/DELETE) são bloqueadas para o role 'authenticated'
-- e devem ser gerenciadas por webhooks ou RPCs com SECURITY DEFINER.

-- Limpar policies antigas, se houver.
DROP POLICY IF EXISTS empresa_addons_select_member ON public.empresa_addons;
DROP POLICY IF EXISTS empresa_addons_insert_policy ON public.empresa_addons;
DROP POLICY IF EXISTS empresa_addons_update_policy ON public.empresa_addons;
DROP POLICY IF EXISTS empresa_addons_delete_policy ON public.empresa_addons;

-- Criar policy de SELECT
CREATE POLICY empresa_addons_select_member
  ON public.empresa_addons FOR SELECT
  TO authenticated
  USING (empresa_id IN (
    SELECT eu.empresa_id
    FROM public.empresa_usuarios eu
    WHERE eu.user_id = auth.uid()
  ));

-- =========================
-- USER_ACTIVE_EMPRESA
-- =========================
-- Descrição: Permite que cada usuário gerencie apenas a sua própria linha,
-- que define qual a sua empresa ativa na sessão.

-- Limpar policies antigas, se houver.
DROP POLICY IF EXISTS user_active_empresa_manage_own ON public.user_active_empresa;
DROP POLICY IF EXISTS user_active_empresa_select_own ON public.user_active_empresa;
DROP POLICY IF EXISTS user_active_empresa_insert_own ON public.user_active_empresa;
DROP POLICY IF EXISTS user_active_empresa_update_own ON public.user_active_empresa;
DROP POLICY IF EXISTS user_active_empresa_delete_own ON public.user_active_empresa;

-- Criar policies para SELECT, INSERT, UPDATE, DELETE
CREATE POLICY user_active_empresa_select_own
  ON public.user_active_empresa FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_active_empresa_insert_own
  ON public.user_active_empresa FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_active_empresa_update_own
  ON public.user_active_empresa FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_active_empresa_delete_own
  ON public.user_active_empresa FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =========================
-- Telemetria
-- =========================
SELECT pg_notify('app_log',
  '[RLS] applied policies to: empresa_addons, user_active_empresa'
);
