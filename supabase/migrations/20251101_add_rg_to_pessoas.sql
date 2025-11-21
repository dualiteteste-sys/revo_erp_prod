-- Migration: Adiciona campo RG e ajusta busca em public.pessoas
-- Requisitos:
--   - Adicionar campo 'rg' para pessoa física.
--   - Atualizar a coluna de busca 'pessoa_search' para incluir o novo campo.

-- 1. Adicionar a coluna 'rg' se ela não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='pessoas'
      AND column_name='rg'
  ) THEN
    ALTER TABLE public.pessoas ADD COLUMN rg TEXT NULL;
    RAISE NOTICE 'Coluna "rg" adicionada a "public.pessoas".';
  ELSE
    RAISE NOTICE 'Coluna "rg" já existe em "public.pessoas".';
  END IF;
END$$;

-- 2. Recriar a coluna gerada 'pessoa_search' para incluir o RG
--    É necessário remover e adicionar a coluna para alterar a expressão de geração.
ALTER TABLE public.pessoas DROP COLUMN IF EXISTS pessoa_search;

ALTER TABLE public.pessoas
ADD COLUMN pessoa_search TEXT
GENERATED ALWAYS AS (
  LOWER(
    COALESCE(nome, '') || ' ' ||
    COALESCE(doc_unico, '') || ' ' ||
    COALESCE(email, '') || ' ' ||
    COALESCE(rg, '') -- Adiciona o RG na busca
  )
) STORED;

-- 3. Recriar o índice GIN na coluna de busca atualizada
DROP INDEX IF EXISTS public.idx_pessoas_search_trgm;

CREATE INDEX idx_pessoas_search_trgm
ON public.pessoas
USING GIN (pessoa_search gin_trgm_ops);

-- 4. Analisar a tabela para atualizar as estatísticas do planejador de consultas
ANALYZE public.pessoas;
