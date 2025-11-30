-- =============================================================================
-- Migração: Remover view dependente e dropar tabela legada public.products
-- Data: 2025-11-07
-- Objetivo: resolver dependência (view -> products) e remover a tabela legada
-- =============================================================================

DO $$
BEGIN
  -- 0) Drop da VIEW compat que depende de public.products (se existir)
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_views
    WHERE schemaname = 'public' AND viewname = 'produtos_compat_view'
  ) THEN
    EXECUTE 'DROP VIEW public.produtos_compat_view';
    PERFORM pg_notify('app_log', '[DROP] View public.produtos_compat_view removida');
  END IF;

  -- 1) Sair cedo se a tabela não existir
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'products'
  ) THEN
    PERFORM pg_notify('app_log', '[DROP] public.products nao existe; nada a fazer');
    RETURN;
  END IF;

  -- 2) Drop do trigger não-interno (se existir) para evitar bloqueios
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

  -- 3) Dropar a tabela legada
  EXECUTE 'DROP TABLE public.products';

  PERFORM pg_notify('app_log', '[DROP] Tabela public.products removida com sucesso');
END
$$ LANGUAGE plpgsql;
