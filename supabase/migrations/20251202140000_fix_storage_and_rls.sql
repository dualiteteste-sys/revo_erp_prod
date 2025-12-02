-- Migration: Fix Storage and RLS (2025-12-02)
-- Description: Ensures 'product_images' bucket exists and policies are correctly applied.

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('product_images', 'product_images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop existing policies on storage.objects for product_images to avoid conflicts
DROP POLICY IF EXISTS "Public Access to Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users can Upload Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users can Update Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users can Delete Product Images" ON storage.objects;

-- 3. Re-create Policies

-- Policy: Allow public access to view product images
CREATE POLICY "Public Access to Product Images"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product_images' );

-- Policy: Allow authenticated users to upload images for their company
CREATE POLICY "Authenticated Users can Upload Product Images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'product_images'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text
        FROM public.empresas e
        WHERE EXISTS (
            SELECT 1
            FROM public.empresa_usuarios eu
            WHERE eu.empresa_id = e.id
              AND eu.user_id = auth.uid()
        )
    )
);

-- Policy: Allow authenticated users to update images for their company
CREATE POLICY "Authenticated Users can Update Product Images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'product_images'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text
        FROM public.empresas e
        WHERE EXISTS (
            SELECT 1
            FROM public.empresa_usuarios eu
            WHERE eu.empresa_id = e.id
              AND eu.user_id = auth.uid()
        )
    )
);

-- Policy: Allow authenticated users to delete images for their company
CREATE POLICY "Authenticated Users can Delete Product Images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'product_images'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text
        FROM public.empresas e
        WHERE EXISTS (
            SELECT 1
            FROM public.empresa_usuarios eu
            WHERE eu.empresa_id = e.id
              AND eu.user_id = auth.uid()
        )
    )
);

-- 4. Ensure produto_imagens table policies are correct (Fix for 42501 permission denied)
-- We re-apply the policies from the previous migration to be sure.

DROP POLICY IF EXISTS "produto_imagens_delete_own_company" ON public.produto_imagens;
DROP POLICY IF EXISTS "produto_imagens_insert_own_company" ON public.produto_imagens;
DROP POLICY IF EXISTS "produto_imagens_select_own_company" ON public.produto_imagens;
DROP POLICY IF EXISTS "produto_imagens_update_own_company" ON public.produto_imagens;

CREATE POLICY "produto_imagens_delete_own_company"
ON public.produto_imagens
FOR DELETE
TO authenticated
USING (empresa_id = public.current_empresa_id());

CREATE POLICY "produto_imagens_insert_own_company"
ON public.produto_imagens
FOR INSERT
TO authenticated
WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY "produto_imagens_select_own_company"
ON public.produto_imagens
FOR SELECT
TO authenticated
USING (empresa_id = public.current_empresa_id());

CREATE POLICY "produto_imagens_update_own_company"
ON public.produto_imagens
FOR UPDATE
TO authenticated
USING (empresa_id = public.current_empresa_id())
WITH CHECK (empresa_id = public.current_empresa_id());

-- Grant permissions explicitly
GRANT ALL ON TABLE public.produto_imagens TO authenticated;
GRANT ALL ON TABLE public.produto_imagens TO service_role;
