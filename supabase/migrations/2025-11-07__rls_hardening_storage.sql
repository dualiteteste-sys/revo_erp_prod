-- =============================================================================
-- Migração: Remover helpers legados em policies e padronizar por empresa_id
-- Data: 2025-11-07
-- Escopo:
--   A) public.products_legacy_archive  -> substituir is_user_member_of() por empresa_id = current_empresa_id()
--   B) storage.objects (buckets: company_logos, product_images) -> normalizar SELECT/INSERT/UPDATE/DELETE
--      para usuários autenticados da empresa (pasta raiz = empresa_id)
-- Observações:
--   - Mantém buckets privados (sem TO public).
--   - Não altera dados; só políticas.
--   - Idempotente: DROPs com IF EXISTS e limpeza por varredura segura.
-- =============================================================================

-- =========================
-- A) public.products_legacy_archive
-- =========================
DROP POLICY IF EXISTS products_legacy_archive_sel ON public.products_legacy_archive;

CREATE POLICY products_legacy_archive_select_own_company
  ON public.products_legacy_archive
  FOR SELECT
  TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- =========================
-- B) storage.objects
-- Padrão de chave: "&lt;empresa_id&gt;/&lt;...&gt;" (empresa_id como 1º segmento do caminho)
-- Regras: apenas authenticated, limitado ao bucket alvo e à pasta da empresa ativa.
-- Nota: Em INSERT, só WITH CHECK é avaliado; em DELETE, só USING.
-- =========================

-- 1) Limpeza preventiva de policies legadas que usavam is_user_member_of()
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND (
        lower(qual) LIKE '%is_user_member_of(%'
        OR lower(with_check) LIKE '%is_user_member_of(%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END
$$ LANGUAGE plpgsql;

-- 2) Recriar policies para bucket 'company_logos'
-- SELECT
CREATE POLICY storage_company_logos_select_own_company
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'company_logos'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  );

-- INSERT
CREATE POLICY storage_company_logos_insert_own_company
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company_logos'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  );

-- UPDATE
CREATE POLICY storage_company_logos_update_own_company
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company_logos'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  )
  WITH CHECK (
    bucket_id = 'company_logos'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  );

-- DELETE
CREATE POLICY storage_company_logos_delete_own_company
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company_logos'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  );

-- 3) Recriar policies para bucket 'product_images'
-- SELECT
CREATE POLICY storage_product_images_select_own_company
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product_images'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  );

-- INSERT
CREATE POLICY storage_product_images_insert_own_company
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product_images'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  );

-- UPDATE
CREATE POLICY storage_product_images_update_own_company
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product_images'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  )
  WITH CHECK (
    bucket_id = 'product_images'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  );

-- DELETE
CREATE POLICY storage_product_images_delete_own_company
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product_images'
    AND ((storage.foldername(name))[1])::uuid = public.current_empresa_id()
  );

-- =========================
-- Telemetria
-- =========================
SELECT pg_notify('app_log',
  '[RLS] normalized: products_legacy_archive + storage.objects (company_logos/product_images) -> authenticated + empresa_id prefix'
);
