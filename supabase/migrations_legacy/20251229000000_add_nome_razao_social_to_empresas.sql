/*
# [Structural] Adiciona a coluna `nome_razao_social` à tabela `empresas`
Esta migração garante que a coluna `nome_razao_social` exista na tabela `public.empresas`, corrigindo um erro de "coluna não encontrada" que ocorre durante a criação de novas empresas no fluxo de onboarding.

## Query Description: 
Esta operação é segura e adiciona uma nova coluna `nome_razao_social` do tipo TEXT se ela ainda não existir. Para garantir a integridade dos dados, ela tenta copiar os valores de uma coluna legada 'nome' (se existir) para a nova coluna. Por fim, define a coluna como NOT NULL, preenchendo quaisquer valores nulos restantes com um placeholder para evitar erros.

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Low"]
- Requires-Backup: [false]
- Reversible: [false]

## Structure Details:
- Tabela afetada: `public.empresas`
- Coluna adicionada: `nome_razao_social` (TEXT NOT NULL)

## Security Implications:
- RLS Status: [Enabled]
- Policy Changes: [No]
- Auth Requirements: [N/A]

## Performance Impact:
- Indexes: [None]
- Triggers: [None]
- Estimated Impact: [Baixo. A adição de uma coluna com valor padrão NULL é rápida. O UPDATE subsequente pode ser lento em tabelas muito grandes, mas é esperado que a tabela `empresas` seja pequena.]
*/

DO $$
BEGIN
  -- Adiciona a coluna 'nome_razao_social' se ela não existir
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'empresas'
      AND column_name = 'nome_razao_social'
  ) THEN
    ALTER TABLE public.empresas ADD COLUMN nome_razao_social TEXT;
    
    -- Se uma coluna 'nome' antiga existir, copia seus dados para a nova coluna
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'empresas'
          AND column_name = 'nome'
    ) THEN
        EXECUTE 'UPDATE public.empresas SET nome_razao_social = nome WHERE nome_razao_social IS NULL;';
    END IF;
  END IF;

  -- Garante que a coluna não seja nula antes de adicionar a restrição NOT NULL
  UPDATE public.empresas SET nome_razao_social = 'Nome não informado' WHERE nome_razao_social IS NULL;
  
  -- Adiciona a restrição NOT NULL se ainda não estiver presente
  IF (
    SELECT is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'empresas' 
      AND column_name = 'nome_razao_social'
  ) = 'YES' THEN
    ALTER TABLE public.empresas ALTER COLUMN nome_razao_social SET NOT NULL;
  END IF;
END;
$$;

-- Recarrega o schema do PostgREST para reconhecer as alterações
SELECT pg_notify('pgrst', 'reload schema');
