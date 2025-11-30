-- =============================================================================
-- Migração: Drop tabela legada public.products (após snapshot)
-- Data: 2025-11-07
-- Objetivo: remover tabela não utilizada e resolver erro do linter
-- Pré-condição: snapshot já existente em archive.products_snapshot_2025_11_07
-- =============================================================================

DO $$
BEGIN
  -- Sair cedo se a tabela não existir
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'products'
  ) THEN
    PERFORM pg_notify('app_log', '[DROP] public.products nao existe; nada a fazer');
    RETURN;
  END IF;

  -- 1) Drop do trigger (se existir) para evitar bloqueios no DROP TABLE
  IF EXISTS (
    SELECT 1
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'products'
      AND tg.tgname = 'products_set_updated_at' AND NOT tg.tgisinternal
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS products_set_updated_at ON public.products';
  END IF;

  -- 2) Drop da tabela (policies e índices atrelados caem junto)
  EXECUTE 'DROP TABLE public.products';

  PERFORM pg_notify('app_log', '[DROP] Tabela public.products removida com sucesso');
END
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Smoke test do linter (não retorna linhas se tudo OK)
-- =============================================================================
-- Tabelas public sem RLS habilitado (deve retornar zero)
-- SELECT table_schema, table_name
-- FROM information_schema.tables t
-- JOIN pg_class c ON c.relname = t.table_name
-- JOIN pg_namespace n ON n.nspname = t.table_schema AND n.oid = c.relnamespace
-- WHERE t.table_schema = 'public'
--   AND c.relkind = 'r'
--   AND EXISTS (SELECT 1 FROM pg_class c2 WHERE c2.oid = c.oid) -- no-op
--   AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
--   AND EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n2 WHERE n2.oid = c.relnamespace);

-- Conferir snapshot ainda presente
-- SELECT COUNT(*) AS snapshot_rows FROM archive.products_snapshot_2025_11_07;
