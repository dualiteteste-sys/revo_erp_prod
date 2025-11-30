/*
  # [RPC] Set Principal Product Image
  [Sets a specific image as the principal one for a product, ensuring only one can be principal at a time.]

  ## Query Description: [This operation updates the 'principal' flag on product images. It first unsets the flag for all images of a given product and then sets it for the specified image, ensuring atomicity. It is a safe, non-destructive operation.]
  
  ## Metadata:
  - Schema-Category: ["Structural"]
  - Impact-Level: ["Low"]
  - Requires-Backup: [false]
  - Reversible: [true]
  
  ## Structure Details:
  - Tables affected: public.produto_imagens
  - Columns affected: principal
  
  ## Security Implications:
  - RLS Status: [Enabled]
  - Policy Changes: [No]
  - Auth Requirements: [User must be a member of the company that owns the product.]
  
  ## Performance Impact:
  - Indexes: [Uses existing primary keys and foreign keys.]
  - Triggers: [No]
  - Estimated Impact: [Low. Affects a small number of rows per call.]
*/
create or replace function public.set_principal_product_image(p_produto_id uuid, p_imagem_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  -- Get the company ID from the product to be updated
  select empresa_id into v_empresa_id from public.produtos where id = p_produto_id;

  if not found then
    raise exception '[RPC][SET_PRINCIPAL] produto não encontrado' using errcode = 'NO_DATA_FOUND';
  end if;

  -- Authorization check: ensure the current user is a member of the company
  if not public.is_user_member_of(v_empresa_id) then
    raise exception '[AUTH] usuário não é membro da empresa' using errcode = '42501';
  end if;

  -- Atomically update the images
  -- First, set all images for this product to not be principal
  update public.produto_imagens
     set principal = false
   where produto_id = p_produto_id
     and empresa_id = v_empresa_id; -- Extra check for security

  -- Then, set the specified image as principal
  update public.produto_imagens
     set principal = true
   where id = p_imagem_id
     and produto_id = p_produto_id
     and empresa_id = v_empresa_id; -- Extra check for security
end;
$$;

grant execute on function public.set_principal_product_image(uuid, uuid) to authenticated;
