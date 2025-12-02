-- Migration: Create Product Images Bucket (2025-12-02)
-- Description: Creates the 'product_images' storage bucket and sets up RLS policies.

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('product_images', 'product_images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Policies

-- Policy: Allow public access to view product images
-- Anyone can view an image if they have the URL (public bucket)
DROP POLICY IF EXISTS "Public Access to Product Images" ON storage.objects;
CREATE POLICY "Public Access to Product Images"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product_images' );

-- Policy: Allow authenticated users to upload images for their company
-- Path convention: {empresa_id}/{produto_id}/{filename}
-- We verify if the user belongs to the company in the path.
DROP POLICY IF EXISTS "Authenticated Users can Upload Product Images" ON storage.objects;
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
DROP POLICY IF EXISTS "Authenticated Users can Update Product Images" ON storage.objects;
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
DROP POLICY IF EXISTS "Authenticated Users can Delete Product Images" ON storage.objects;
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
