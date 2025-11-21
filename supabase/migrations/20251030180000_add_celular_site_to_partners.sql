-- [MIGRATION] Adiciona campos de contato à tabela pessoas
-- Adiciona as colunas 'celular' e 'site' e as inclui na busca textual.
/*
          # [Operation Name]
          Adicionar Colunas de Contato e Atualizar Busca

          [Description of what this operation does]
          Esta operação adiciona as colunas `celular` e `site` à tabela `pessoas` e atualiza a coluna de busca textual `pessoa_search` para incluir os novos campos, melhorando a capacidade de pesquisa.

          ## Query Description: [Write a clear, informative message that:
          1. Explains the impact on existing data
          2. Highlights potential risks or safety concerns
          3. Suggests precautions (e.g., backup recommendations)
          4. Uses non-technical language when possible
          5. Keeps it concise but comprehensive
          Example: "This operation will modify user account structures - backup recommended. Changes affect login data and may require application updates."]
          Esta operação altera a estrutura da tabela `pessoas`. Nenhum dado existente será perdido, pois as novas colunas são adicionadas como nulas. A coluna de busca será reconstruída, o que pode causar um breve impacto na performance durante a operação.

          ## Metadata:
          - Schema-Category: "Structural"
          - Impact-Level: "Low"
          - Requires-Backup: false
          - Reversible: true
          
          ## Structure Details:
          - Tabela afetada: public.pessoas
          - Colunas adicionadas: celular (TEXT), site (TEXT)
          - Coluna modificada: pessoa_search (expressão gerada)
          - Índices recriados: idx_pessoas_search_trgm
          
          ## Security Implications:
          - RLS Status: Inalterado
          - Policy Changes: Não
          - Auth Requirements: Privilégios de alteração de tabela.
          
          ## Performance Impact:
          - Indexes: O índice `idx_pessoas_search_trgm` será recriado, o que pode levar algum tempo em tabelas grandes.
          - Triggers: Nenhum.
          - Estimated Impact: Baixo. A busca textual se tornará mais abrangente.
          */
-- 1. Adiciona as colunas 'celular' e 'site' se não existirem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pessoas' AND column_name='celular') THEN
    ALTER TABLE public.pessoas ADD COLUMN celular TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pessoas' AND column_name='site') THEN
    ALTER TABLE public.pessoas ADD COLUMN site TEXT NULL;
  END IF;
END;
$$;

-- 2. Atualiza a coluna de busca para incluir os novos campos
-- É necessário remover e recriar a coluna para alterar a expressão gerada.
ALTER TABLE public.pessoas DROP COLUMN IF EXISTS pessoa_search;

ALTER TABLE public.pessoas
ADD COLUMN pessoa_search TEXT
GENERATED ALWAYS AS (
  lower(
    coalesce(nome, '') || ' ' ||
    coalesce(doc_unico, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(celular, '') || ' ' ||
    coalesce(site, '') || ' ' ||
    coalesce(rg, '') || ' ' ||
    coalesce(carteira_habilitacao, '')
  )
) STORED;

-- 3. Recria o índice na coluna de busca atualizada
DROP INDEX IF EXISTS idx_pessoas_search_trgm;
CREATE INDEX IF NOT EXISTS idx_pessoas_search_trgm
  ON public.pessoas
  USING gin (pessoa_search gin_trgm_ops);
