-- =============================================================================
-- Migração: Resolver aviso "RLS Enabled No Policy" em public.products (Opção B)
-- Data: 2025-11-07
-- Objetivo: Desabilitar RLS na tabela legada `public.products` (mantendo os dados)
-- Motivo: Tabela não é mais usada pelo front/RPCs atuais; remover o aviso do linter.
-- Reversibilidade: para reverter -&gt; ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
-- Observação: Não modifica dados nem FKs.
-- =============================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  -- 0) Guard-rail: só executa se a tabela existir
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_class c
    JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname = 'public' AND c.relname = 'products'
  ) THEN
    RAISE NOTICE '[RLS] Tabela public.products não existe; nada a fazer.';
    RETURN;
  END IF;

  -- 1) Desabilitar RLS (remove o gatilho do aviso "RLS Enabled No Policy")
  EXECUTE 'ALTER TABLE public.products DISABLE ROW LEVEL SECURITY';

  -- 2) (Opcional) Limpar policies residuais, se existirem
  FOR pol IN
    SELECT pol.polname
    FROM   pg_catalog.pg_policy pol
    JOIN   pg_catalog.pg_class  c ON c.oid = pol.polrelid
    JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname = 'public' AND c.relname = 'products'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.products', pol.polname);
  END LOOP;

  PERFORM pg_notify('app_log', '[RLS] disabled on public.products (legacy table; data preserved)');
END
$$ LANGUAGE plpgsql;

-- =============================================================================
-- (Comentado) Alternativa futura se for realmente legado e quiser arquivar:
--   -- ALTER TABLE public.products RENAME TO products_legacy_archive;
--   -- ALTER TABLE public.products_legacy_archive DISABLE ROW LEVEL SECURITY;
-- =============================================================================
