-- Create table for units of measure
CREATE TABLE IF NOT EXISTS public.unidades_medida (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID REFERENCES public.empresas(id),
    sigla TEXT NOT NULL,
    descricao TEXT NOT NULL,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Unique constraint: sigla must be unique per company, or unique among system defaults (where empresa_id is null)
    CONSTRAINT unidades_medida_sigla_empresa_unique UNIQUE NULLS NOT DISTINCT (empresa_id, sigla)
);

-- Enable RLS
ALTER TABLE public.unidades_medida ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Read: Allow access to system defaults (empresa_id IS NULL) AND company-specific units
CREATE POLICY "Enable read access for authenticated users" ON public.unidades_medida
    FOR SELECT
    TO authenticated
    USING (
        empresa_id IS NULL 
        OR 
        empresa_id = (SELECT auth.user_empresa_id())
    );

-- 2. Insert: Allow authenticated users to insert units for their own company
CREATE POLICY "Enable insert for authenticated users" ON public.unidades_medida
    FOR INSERT
    TO authenticated
    WITH CHECK (
        empresa_id = (SELECT auth.user_empresa_id())
    );

-- 3. Update: Allow authenticated users to update units for their own company
CREATE POLICY "Enable update for authenticated users" ON public.unidades_medida
    FOR UPDATE
    TO authenticated
    USING (
        empresa_id = (SELECT auth.user_empresa_id())
    )
    WITH CHECK (
        empresa_id = (SELECT auth.user_empresa_id())
    );

-- 4. Delete: Allow authenticated users to delete units for their own company
CREATE POLICY "Enable delete for authenticated users" ON public.unidades_medida
    FOR DELETE
    TO authenticated
    USING (
        empresa_id = (SELECT auth.user_empresa_id())
    );

-- Seed default data
INSERT INTO public.unidades_medida (sigla, descricao, empresa_id)
VALUES 
    ('UN', 'Unidade', NULL),
    ('KG', 'Quilograma', NULL),
    ('G', 'Grama', NULL),
    ('M', 'Metro', NULL),
    ('CM', 'Centímetro', NULL),
    ('MM', 'Milímetro', NULL),
    ('L', 'Litro', NULL),
    ('ML', 'Mililitro', NULL),
    ('CX', 'Caixa', NULL),
    ('DZ', 'Dúzia', NULL),
    ('PAR', 'Par', NULL),
    ('TON', 'Tonelada', NULL),
    ('M2', 'Metro Quadrado', NULL),
    ('M3', 'Metro Cúbico', NULL),
    ('PCT', 'Pacote', NULL),
    ('RL', 'Rolo', NULL),
    ('CJ', 'Conjunto', NULL)
ON CONFLICT (empresa_id, sigla) DO NOTHING;

-- Grant permissions
GRANT ALL ON TABLE public.unidades_medida TO authenticated;
GRANT ALL ON TABLE public.unidades_medida TO service_role;
