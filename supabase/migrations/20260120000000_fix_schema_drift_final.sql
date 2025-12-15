/*
  # Fix Schema Drift (Final)
  
  Consolidated fix for:
  1. View `industria_roteiro_etapas`: Explicit definitions to fix hash mismatch.
  2. Missing PKs: empresa_addons, empresa_usuarios.
  3. Divergent Defaults: produtos.tipo, industria_roteiros.versao.
  4. Policies: Canonical RLS for industria_roteiros_etapas.
*/

-- =================================================================
-- 1. Fix View `public.industria_roteiro_etapas`
-- =================================================================
-- Drop first to allow replacement with different column set depending on drift
DROP VIEW IF EXISTS public.industria_roteiro_etapas;

CREATE OR REPLACE VIEW public.industria_roteiro_etapas AS
SELECT 
    e.id,
    e.empresa_id,
    e.roteiro_id,
    e.sequencia,
    e.nome,
    e.centro_trabalho_id,
    e.descricao,
    e.tempo_setup,
    e.tempo_operacao,
    e.created_at,
    e.updated_at
FROM public.industria_roteiros_etapas e;

COMMENT ON VIEW public.industria_roteiro_etapas IS 'Canonical view for roteiro stages';

-- =================================================================
-- 2. Fix Policies for `industria_roteiros_etapas`
-- =================================================================
ALTER TABLE public.industria_roteiros_etapas ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Enable all access" ON public.industria_roteiros_etapas;
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.industria_roteiros_etapas;
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.industria_roteiros_etapas;
    DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.industria_roteiros_etapas;
    DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.industria_roteiros_etapas;
    
    -- Create canonical policy
    CREATE POLICY "Enable all access" 
    ON public.industria_roteiros_etapas 
    FOR ALL 
    TO public 
    USING (empresa_id = public.current_empresa_id());
END $$;

-- =================================================================
-- 3. Fix Missing PKs
-- =================================================================
DO $$
BEGIN
    -- empresa_addons
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_addons_pkey') THEN
        ALTER TABLE public.empresa_addons ADD CONSTRAINT empresa_addons_pkey PRIMARY KEY (id);
    END IF;

    -- empresa_usuarios
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_usuarios_pkey') THEN
        ALTER TABLE public.empresa_usuarios ADD CONSTRAINT empresa_usuarios_pkey PRIMARY KEY (id);
    END IF;
END $$;

-- =================================================================
-- 4. Fix Defaults (Type Sensitive)
-- =================================================================

-- produtos.tipo
DO $$
DECLARE
    col_type text;
BEGIN
    SELECT format_type(atttypid, atttypmod) INTO col_type
    FROM pg_attribute 
    WHERE attrelid = 'public.produtos'::regclass AND attname = 'tipo';

    IF col_type = 'public.tipo_produto' THEN
        -- Verify 'produto' exists in enum (it should, but safety first)
        BEGIN
            ALTER TABLE public.produtos ALTER COLUMN tipo SET DEFAULT 'produto'::public.tipo_produto;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not set default for produtos.tipo (enum): %', SQLERRM;
        END;
    ELSIF col_type LIKE '%character%' OR col_type = 'text' THEN
        ALTER TABLE public.produtos ALTER COLUMN tipo SET DEFAULT 'produto';
    ELSE
        RAISE NOTICE 'Skipping produtos.tipo default: unexpected type %', col_type;
    END IF;
END $$;

-- industria_roteiros.versao
DO $$
DECLARE
    col_type text;
BEGIN
    SELECT format_type(atttypid, atttypmod) INTO col_type
    FROM pg_attribute 
    WHERE attrelid = 'public.industria_roteiros'::regclass AND attname = 'versao';

    IF col_type = 'integer' THEN
        ALTER TABLE public.industria_roteiros ALTER COLUMN versao SET DEFAULT 1;
    ELSIF col_type LIKE '%character%' OR col_type = 'text' THEN
        ALTER TABLE public.industria_roteiros ALTER COLUMN versao SET DEFAULT '1.0';
    ELSE
        RAISE NOTICE 'Skipping industria_roteiros.versao default: unexpected type %', col_type;
    END IF;
END $$;
