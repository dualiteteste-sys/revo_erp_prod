-- Create Pessoas Table (Partners)
-- This was missing from baseline but required by MRP logic

BEGIN;

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE public.tipo_pessoa_enum AS ENUM ('fisica', 'juridica', 'estrangeiro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.contribuinte_icms_enum AS ENUM ('1', '2', '9'); -- 1: Contribuinte, 2: Isento, 9: Não Contribuinte
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.pessoa_tipo AS ENUM ('cliente', 'fornecedor', 'ambos', 'transportadora', 'colaborador');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


-- 2. Create Table
CREATE TABLE IF NOT EXISTS public.pessoas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    nome text NOT NULL,
    fantasia text,
    tipo public.pessoa_tipo DEFAULT 'cliente', -- Categorization (Customer/Vendor)
    tipo_pessoa public.tipo_pessoa_enum DEFAULT 'juridica', -- PF/PJ
    doc_unico text, -- CPF/CNPJ
    email text,
    telefone text,
    inscr_estadual text,
    isento_ie boolean DEFAULT false,
    inscr_municipal text,
    observacoes text,
    codigo_externo text,
    contribuinte_icms public.contribuinte_icms_enum DEFAULT 'nao_contribuinte',
    contato_tags text[],
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    deleted_at timestamptz -- Soft delete support if needed
);

-- 3. RLS
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.pessoas;
CREATE POLICY "Enable read access for all users" ON public.pessoas
    FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.pessoas;
CREATE POLICY "Enable insert for authenticated users only" ON public.pessoas
    FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.pessoas;
CREATE POLICY "Enable update for authenticated users only" ON public.pessoas
    FOR UPDATE USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.pessoas;
CREATE POLICY "Enable delete for authenticated users only" ON public.pessoas
    FOR DELETE USING (empresa_id = public.current_empresa_id());

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_pessoas_empresa_id ON public.pessoas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON public.pessoas(empresa_id, nome);
CREATE INDEX IF NOT EXISTS idx_pessoas_doc ON public.pessoas(empresa_id, doc_unico);

-- 5. Triggers
CREATE TRIGGER handle_updated_at_pessoas
BEFORE UPDATE ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMIT;
