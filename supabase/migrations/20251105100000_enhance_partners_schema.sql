-- MIGRATION: Melhora o schema de Parceiros (pessoas) com novos campos e tipos.

-- 1. Novos ENUMs para tipificação
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_pessoa_enum') THEN
        CREATE TYPE public.tipo_pessoa_enum AS ENUM ('fisica', 'juridica', 'estrangeiro');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribuinte_icms_enum') THEN
        CREATE TYPE public.contribuinte_icms_enum AS ENUM ('1', '2', '9');
    END IF;
END$$;


-- 2. Adiciona novas colunas à tabela 'pessoas'
ALTER TABLE public.pessoas
    ADD COLUMN IF NOT EXISTS tipo_pessoa public.tipo_pessoa_enum NOT NULL DEFAULT 'juridica',
    ADD COLUMN IF NOT EXISTS fantasia TEXT,
    ADD COLUMN IF NOT EXISTS codigo_externo TEXT,
    ADD COLUMN IF NOT EXISTS contribuinte_icms public.contribuinte_icms_enum NOT NULL DEFAULT '9',
    ADD COLUMN IF NOT EXISTS contato_tags TEXT[];

-- 3. Atualiza a coluna de busca para incluir o novo campo 'fantasia'
--    É necessário remover e adicionar a coluna para alterar a expressão gerada.
ALTER TABLE public.pessoas DROP COLUMN IF EXISTS pessoa_search;
ALTER TABLE public.pessoas ADD COLUMN pessoa_search TEXT
    GENERATED ALWAYS AS (
        lower(
            coalesce(nome, '') || ' ' ||
            coalesce(doc_unico, '') || ' ' ||
            coalesce(email, '') || ' ' ||
            coalesce(fantasia, '')
        )
    ) STORED;

-- 4. Recria o índice na coluna de busca atualizada
DROP INDEX IF EXISTS idx_pessoas_search_trgm;
CREATE INDEX idx_pessoas_search_trgm
  ON public.pessoas
  USING gin (pessoa_search gin_trgm_ops);
