-- Fix RLS policies for units to replaced dependency on current_empresa_id() which is returning NULL
-- Using explicit check against empresa_usuarios table instead

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.unidades_medida;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.unidades_medida;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.unidades_medida;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.unidades_medida;

-- Recreate policies with robust method

-- 1. Read: Allow access to system defaults (empresa_id IS NULL) AND units for companies the user belongs to
CREATE POLICY "Enable read access for authenticated users" ON public.unidades_medida
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

-- 2. Insert: Allow authenticated users to insert units for companies they belong to
CREATE POLICY "Enable insert for authenticated users" ON public.unidades_medida
    FOR INSERT
    TO authenticated
    WITH CHECK (
        empresa_id IN (
            SELECT empresa_id 
            FROM public.empresa_usuarios 
            WHERE user_id = auth.uid()
        )
    );

-- 3. Update: Allow authenticated users to update units for companies they belong to
CREATE POLICY "Enable update for authenticated users" ON public.unidades_medida
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

-- 4. Delete: Allow authenticated users to delete units for companies they belong to
CREATE POLICY "Enable delete for authenticated users" ON public.unidades_medida
    FOR DELETE
    TO authenticated
    USING (
        empresa_id IN (
            SELECT empresa_id 
            FROM public.empresa_usuarios 
            WHERE user_id = auth.uid()
        )
    );
