-- Create table for packaging types (Embalagens)
CREATE TYPE public.tipo_embalagem_registry AS ENUM ('pacote_caixa', 'envelope', 'rolo_cilindro', 'outro');

CREATE TABLE IF NOT EXISTS public.embalagens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID REFERENCES public.empresas(id),
    nome TEXT NOT NULL,
    tipo public.tipo_embalagem_registry NOT NULL DEFAULT 'pacote_caixa',
    ativo BOOLEAN DEFAULT true,
    
    -- Dimensions (all nullable as they depend on type)
    largura numeric,
    altura numeric,
    comprimento numeric,
    diametro numeric,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Constraints
    CONSTRAINT embalagens_nome_empresa_unique UNIQUE NULLS NOT DISTINCT (empresa_id, nome)
);

-- Enable RLS
ALTER TABLE public.embalagens ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Read: Allow access to system defaults (empresa_id IS NULL) AND company-specific packaging
CREATE POLICY "Enable read access for authenticated users" ON public.embalagens
    FOR SELECT
    TO authenticated
    USING (
        empresa_id IS NULL 
        OR 
        empresa_id IN (
            SELECT empresa_id 
            FROM public.empresa_usuarios 
            WHERE user_id = auth.uid()
        )
    );

-- 2. Insert: Allow authenticated users to insert packaging for their own companies
CREATE POLICY "Enable insert for authenticated users" ON public.embalagens
    FOR INSERT
    TO authenticated
    WITH CHECK (
        empresa_id IN (
            SELECT empresa_id 
            FROM public.empresa_usuarios 
            WHERE user_id = auth.uid()
        )
    );

-- 3. Update: Allow authenticated users to update packaging for their own companies
CREATE POLICY "Enable update for authenticated users" ON public.embalagens
    FOR UPDATE
    TO authenticated
    USING (
        empresa_id IN (
            SELECT empresa_id 
            FROM public.empresa_usuarios 
            WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        empresa_id IN (
            SELECT empresa_id 
            FROM public.empresa_usuarios 
            WHERE user_id = auth.uid()
        )
    );

-- 4. Delete: Allow authenticated users to delete packaging for their own companies
CREATE POLICY "Enable delete for authenticated users" ON public.embalagens
    FOR DELETE
    TO authenticated
    USING (
        empresa_id IN (
            SELECT empresa_id 
            FROM public.empresa_usuarios 
            WHERE user_id = auth.uid()
        )
    );

-- Grant permissions
GRANT ALL ON TABLE public.embalagens TO authenticated;
GRANT ALL ON TABLE public.embalagens TO service_role;

-- Seed Data (Correios Standards & Common Types)
INSERT INTO public.embalagens (nome, tipo, largura, altura, comprimento, diametro, empresa_id)
VALUES 
    -- Correios Standard Boxes
    ('Caixa Correios 1 (18x13.5x9)', 'pacote_caixa', 13.5, 9, 18, NULL, NULL),
    ('Caixa Correios 2 (27x18x9)', 'pacote_caixa', 18, 9, 27, NULL, NULL),
    ('Caixa Correios 3 (27x22.5x13.5)', 'pacote_caixa', 22.5, 13.5, 27, NULL, NULL),
    ('Caixa Correios 4 (36x27x18)', 'pacote_caixa', 27, 18, 36, NULL, NULL),
    ('Caixa Correios 5 (54x36x27)', 'pacote_caixa', 36, 27, 54, NULL, NULL),
    
    -- Envelopes
    ('Envelope A4 (21x30)', 'envelope', 21, NULL, 30, NULL, NULL),
    ('Envelope A3 (30x42)', 'envelope', 30, NULL, 42, NULL, NULL),
    ('Envelope Saco (Pequeno)', 'envelope', 11, NULL, 22, NULL, NULL),
    ('Envelope Saco (Médio)', 'envelope', 22.9, NULL, 32.4, NULL, NULL),
    
    -- Cylinders/Tubes
    ('Tubo/Rolo (40x10)', 'rolo_cilindro', NULL, 40, NULL, 10, NULL),
    ('Tubo/Rolo (60x10)', 'rolo_cilindro', NULL, 60, NULL, 10, NULL),
    ('Tubo/Rolo (100x10)', 'rolo_cilindro', NULL, 100, NULL, 10, NULL)
ON CONFLICT (empresa_id, nome) DO NOTHING;
