/*
          # [Operation Name]
          Fix Product Image Permissions and Atomic Deletion

          ## Query Description: [This script overhauls the security policies for product images and introduces an atomic deletion function. It drops all previous, potentially incorrect policies for the `produto_imagens` table and the `product_images` storage bucket to ensure a clean state. It then creates new, more robust Row Level Security (RLS) policies that correctly leverage the `is_user_member_of` helper function to enforce strict tenant isolation. A new RPC, `delete_product_image`, is created to handle the deletion of an image from both the database and the storage bucket in a single, secure transaction, preventing orphaned files. This change significantly improves the security and reliability of the media management feature.]
          
          ## Metadata:
          - Schema-Category: "Structural"
          - Impact-Level: "Medium"
          - Requires-Backup: false
          - Reversible: false
          
          ## Structure Details:
          - Drops and recreates RLS policies on `public.produto_imagens`.
          - Drops and recreates RLS policies on `storage.objects` for the `product_images` bucket.
          - Creates a new RPC function: `public.delete_product_image(uuid)`.
          
          ## Security Implications:
          - RLS Status: Enabled
          - Policy Changes: Yes
          - Auth Requirements: User must be authenticated and a member of the company.
          
          ## Performance Impact:
          - Indexes: None
          - Triggers: None
          - Estimated Impact: Low. Policy checks are efficient.
          */

-- Drop existing policies to ensure a clean slate
DROP POLICY IF EXISTS "Allow select for users of the same company" ON public.produto_imagens;
DROP POLICY IF EXISTS "Allow insert for users of the same company" ON public.produto_imagens;
DROP POLICY IF EXISTS "Allow update for users of the same company" ON public.produto_imagens;
DROP POLICY IF EXISTS "Allow delete for users of the same company" ON public.produto_imagens;

DROP POLICY IF EXISTS "Allow public read access to product images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload to their company folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow owner to delete their files" ON storage.objects;
DROP POLICY IF EXISTS "Allow owner to update their files" ON storage.objects;

-- Ensure RLS is enabled on the table
ALTER TABLE public.produto_imagens ENABLE ROW LEVEL SECURITY;

-- == POLICIES FOR public.produto_imagens ==

CREATE POLICY "Allow select for users of the same company"
ON public.produto_imagens FOR SELECT
USING ( is_user_member_of(empresa_id) );

CREATE POLICY "Allow insert for users of the same company"
ON public.produto_imagens FOR INSERT
WITH CHECK ( is_user_member_of(empresa_id) );

CREATE POLICY "Allow update for users of the same company"
ON public.produto_imagens FOR UPDATE
USING ( is_user_member_of(empresa_id) );

-- Deletion is handled by a secure RPC, so no DELETE policy is needed here.

-- == POLICIES FOR storage.objects (for bucket 'product_images') ==
-- IMPORTANT: This assumes the 'product_images' bucket is marked as PUBLIC in the Supabase Dashboard.

CREATE POLICY "Allow public read access to product images"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product_images' );

CREATE POLICY "Allow authenticated users to upload to their company folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product_images'
  AND is_user_member_of((string_to_array(name, '/'))[1]::uuid)
);

-- Deletion and updates will be handled by a SECURITY DEFINER function, not direct RLS, for atomicity.

-- == RPC for ATOMIC DELETION ==
CREATE OR REPLACE FUNCTION delete_product_image(p_image_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_image_record public.produto_imagens;
  v_empresa_id uuid;
BEGIN
  -- Check if user is a member of the company that owns the image
  SELECT empresa_id INTO v_empresa_id FROM public.produto_imagens WHERE id = p_image_id;
  
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Imagem não encontrada.';
  END IF;

  IF NOT is_user_member_of(v_empresa_id) THEN
    RAISE EXCEPTION 'Permissão negada para excluir esta imagem.';
  END IF;

  -- Get the full image record to get the URL for storage deletion
  SELECT * INTO v_image_record FROM public.produto_imagens WHERE id = p_image_id;

  -- Delete from storage
  PERFORM storage.delete_object('product_images', v_image_record.url);

  -- Delete from database
  DELETE FROM public.produto_imagens WHERE id = p_image_id;

END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_product_image(uuid) TO authenticated;
