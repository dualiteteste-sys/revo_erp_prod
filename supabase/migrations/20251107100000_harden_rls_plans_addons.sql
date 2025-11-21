-- =============================================================================
-- Migração: RLS hardening em plans, empresa_addons e user_active_empresa
-- Data: 2025-11-07
-- Objetivo:
-- - Remover policies com TO public.
-- - Garantir acesso somente via 'authenticated'.
-- - Em 'plans', expor apenas planos ativos para anon/authenticated (p/ pricing).
-- =============================================================================

-- =========================
-- PLANS
-- =========================
-- Remover policy permissiva (TO public TRUE)
DROP POLICY IF EXISTS "Permitir leitura pública dos planos" ON public.plans;

-- Manter somente leitura de planos ativos (já existe com anon,authenticated).
-- Opcional: garantir (idempotente) recriação correta:
DROP POLICY IF EXISTS "Habilita leitura pública para planos ativos" ON public.plans;
CREATE POLICY "Habilita leitura pública para planos ativos"
  ON public.plans FOR SELECT
  TO anon, authenticated
  USING (active = true);

-- =========================
-- EMPRESA_ADDONS
-- =========================
-- Havia policy: "Membros veem seus add-ons" com TO public. Substituir por authenticated.
DROP POLICY IF EXISTS "Membros veem seus add-ons" ON public.empresa_addons;

CREATE POLICY empresa_addons_select_member_authenticated
  ON public.empresa_addons FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = empresa_addons.empresa_id
      AND eu.user_id = auth.uid()
  ));

-- (Sem INSERT/UPDATE/DELETE para authenticated; mutações devem ser via RPC/automação)

-- =========================
-- USER_ACTIVE_EMPRESA
-- =========================
-- Remover policies legadas com TO public
DROP POLICY IF EXISTS user_active_empresa_sel  ON public.user_active_empresa;
DROP POLICY IF EXISTS user_active_empresa_ins  ON public.user_active_empresa;
DROP POLICY IF EXISTS user_active_empresa_upd  ON public.user_active_empresa;
DROP POLICY IF EXISTS user_active_empresa_del  ON public.user_active_empresa;

-- Recriar restritas ao próprio usuário autenticado
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
SELECT pg_notify('app_log', '[RLS] hardened: plans (only active via anon/auth), empresa_addons(auth only), user_active_empresa(auth only)');
