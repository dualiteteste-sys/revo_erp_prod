-- Migration: Adiciona campo carteira_habilitacao e otimiza busca em pessoas

-- 1. Adiciona a nova coluna para CNH
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'carteira_habilitacao'
  ) THEN
    ALTER TABLE public.pessoas ADD COLUMN carteira_habilitacao TEXT NULL;
  END IF;
END$$;

-- 2. Atualiza a coluna de busca para incluir os novos campos (rg e carteira_habilitacao)
--    É necessário remover e recriar a coluna gerada para alterar sua expressão.
ALTER TABLE public.pessoas DROP COLUMN IF EXISTS pessoa_search;

ALTER TABLE public.pessoas
ADD COLUMN pessoa_search TEXT
GENERATED ALWAYS AS (
  lower(
    coalesce(nome, '') || ' ' ||
    coalesce(doc_unico, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(rg, '') || ' ' ||
    coalesce(carteira_habilitacao, '')
  )
) STORED;

-- 3. Recria o índice GIN na coluna de busca atualizada
DROP INDEX IF EXISTS idx_pessoas_search_trgm;
CREATE INDEX idx_pessoas_search_trgm
ON public.pessoas
USING gin (pessoa_search gin_trgm_ops);

-- 4. Manutenção de estatísticas
ANALYZE public.pessoas;
