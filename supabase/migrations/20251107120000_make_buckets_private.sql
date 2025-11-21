-- ============================================================================
-- Migração: Buckets privados (company_logos, product_images)
-- Data: 2025-11-07
-- Objetivo: garantir que os buckets não sejam públicos; acesso só via RLS/policies
-- Segurança: já temos policies auth-only em storage.objects para esses buckets
-- Idempotente: só altera se 'public = true'
-- ============================================================================

DO $$
DECLARE
  v_changed int := 0;
BEGIN
  -- Guard-rail: confirmar existência dos buckets-alvo
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE name IN ('company_logos','product_images')) THEN
    RAISE NOTICE '[STORAGE] Buckets alvo (company_logos, product_images) não existem; nada a fazer.';
    RETURN;
  END IF;

  -- Tornar privados apenas os buckets alvo que ainda estiverem públicos
  UPDATE storage.buckets
     SET public = false
   WHERE name IN ('company_logos','product_images')
     AND public = true;

  GET DIAGNOSTICS v_changed = ROW_COUNT;

  PERFORM pg_notify(
    'app_log',
    '[STORAGE] Buckets privatizados: ' || v_changed || ' (company_logos, product_images)'
  );
END
$$ LANGUAGE plpgsql;

-- (Opcional) Smoke-check rápido (somente leitura/diagnóstico)
-- SELECT name, public FROM storage.buckets WHERE name IN ('company_logos','product_images');
