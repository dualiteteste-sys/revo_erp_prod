-- ============================================================================
-- Migração: Remover policies com TO public remanescentes (subs/addons/storage)
-- Data: 2025-11-07
-- Objetivo:
--   - subscriptions: trocar SELECT para authenticated; remover "ALL false" pública.
--   - addons: remover leitura pública; manter apenas leitura para authenticated.
--   - storage.objects: remover policies de leitura pública herdadas.
-- Pré-condições:
--   - Já existem policies authenticated criadas para empresa_addons e storage buckets
--     (company_logos, product_images) em migrações anteriores.
--   - subscriptions segue gerenciado por RPC/automação (sem INSERT/UPDATE/DELETE diretos).
-- ============================================================================

-- =========================
-- SUBSCRIPTIONS
-- =========================
-- Remover policies públicas remanescentes
DROP POLICY IF EXISTS "Membros podem ver a assinatura da sua empresa" ON public.subscriptions;
DROP POLICY IF EXISTS "Bloquear modificações de assinatura no cliente" ON public.subscriptions;

-- Recriar SELECT apenas para authenticated (membros da empresa)
CREATE POLICY subscriptions_select_member_authenticated
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = subscriptions.empresa_id
        AND eu.user_id     = auth.uid()
    )
  );

-- Sem INSERT/UPDATE/DELETE -> RLS bloqueia por padrão (mutações via RPC/automatização).

-- =========================
-- ADDONS
-- =========================
-- Remover leitura pública
DROP POLICY IF EXISTS "Permitir leitura pública dos addons" ON public.addons;

-- (Opcional idempotente) Garantir SELECT apenas para authenticated (se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_policies
    WHERE  schemaname = 'public'
       AND tablename  = 'addons'
       AND policyname = 'addons_select_authenticated'
  ) THEN
    CREATE POLICY addons_select_authenticated
      ON public.addons FOR SELECT
      TO authenticated
      USING (true);
    -- Nota: se addons tiverem escopo por empresa no futuro, substituir 'true' por predicate.
  END IF;
END
$$ LANGUAGE plpgsql;

-- =========================
-- STORAGE.OBJECTS
-- =========================
-- Remover políticas PÚBLICAS de leitura herdadas (nomes encontrados no diagnóstico)
DROP POLICY IF EXISTS "Permite acesso de leitura público"            ON storage.objects;
DROP POLICY IF EXISTS "so_public_read_product_images"                ON storage.objects;
DROP POLICY IF EXISTS "Public read access for company logos"         ON storage.objects;

-- Mantemos as policies autenticadas criadas anteriormente:
--   storage_company_logos_* e storage_product_images_* (auth-only + empresa_id no prefixo)

-- =========================
-- Telemetria
-- =========================
SELECT pg_notify(
  'app_log',
  '[RLS] cleaned: removed TO public (subscriptions/addons/storage.objects); auth-only enforced'
);
