-- Migration: Create Company Logos Bucket (2025-12-01)
-- Description: Creates the 'company_logos' storage bucket and sets up RLS policies.

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('company_logos', 'company_logos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on storage.objects (Skipped: usually already enabled and requires high privileges)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Policies

-- Policy: Allow public access to view logos
-- Anyone can view a logo if they have the URL (public bucket)
CREATE POLICY "Public Access to Company Logos"
ON storage.objects FOR SELECT
USING ( bucket_id = 'company_logos' );

-- Policy: Allow authenticated users to upload logos for their company
-- Path convention: {empresa_id}/{filename}
-- We verify if the user belongs to the company in the path.
CREATE POLICY "Authenticated Users can Upload Company Logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'company_logos'
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

-- Policy: Allow authenticated users to update logos for their company
CREATE POLICY "Authenticated Users can Update Company Logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'company_logos'
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

-- Policy: Allow authenticated users to delete logos for their company
CREATE POLICY "Authenticated Users can Delete Company Logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'company_logos'
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
