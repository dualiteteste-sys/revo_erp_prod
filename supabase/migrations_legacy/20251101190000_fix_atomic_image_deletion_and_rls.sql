-- [SECURITY][MEDIA] Produto Imagens: RLS + RPC de deleção atômica

-- 0) Pré-requisitos: helper de membresia
--   - Requer public.is_user_member_of(empresa_id) (security definer)
--   - Bucket 'product_images' já criado

-- 1) Limpa policies antigas conhecidas (idempotente)
drop policy if exists "Allow select for users of the same company" on public.produto_imagens;
drop policy if exists "Allow insert for users of the same company" on public.produto_imagens;
drop policy if exists "Allow update for users of the same company" on public.produto_imagens;
drop policy if exists "Allow delete for users of the same company" on public.produto_imagens;

drop policy if exists "Allow public read access to product images" on storage.objects;
drop policy if exists "Allow authenticated users to upload to their company folder" on storage.objects;
drop policy if exists "Allow owner to delete their files" on storage.objects;
drop policy if exists "Allow owner to update their files" on storage.objects;

-- 2) Garante RLS na tabela
alter table public.produto_imagens enable row level security;

-- 3) Policies para public.produto_imagens (sem DELETE direto)
create policy "pi_select_same_company"
  on public.produto_imagens for select
  using (public.is_user_member_of(empresa_id));

create policy "pi_insert_same_company"
  on public.produto_imagens for insert
  with check (public.is_user_member_of(empresa_id));

create policy "pi_update_same_company"
  on public.produto_imagens for update
  using (public.is_user_member_of(empresa_id))
  with check (public.is_user_member_of(empresa_id));

-- 4) Policies para storage.objects (bucket 'product_images')
-- IMPORTANTE: Pressupõe bucket público para leitura.
create policy "so_public_read_product_images"
  on storage.objects for select
  using (bucket_id = 'product_images');

create policy "so_upload_company_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product_images'
    and public.is_user_member_of( (string_to_array(name, '/'))[1]::uuid )
  );

-- 5) RPC de deleção atômica (DB + Storage)
create or replace function public.delete_product_image(p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_img record;
  v_empresa_id uuid;
  v_first_segment uuid;
begin
  -- Busca registro e empresa
  select id, empresa_id, url
    into v_img
    from public.produto_imagens
   where id = p_image_id;

  if not found then
    raise exception '[RPC][DELETE_IMG] imagem não encontrada' using errcode = 'NO_DATA_FOUND';
  end if;

  v_empresa_id := v_img.empresa_id;

  -- Autorização por membresia
  if not public.is_user_member_of(v_empresa_id) then
    raise exception '[AUTH] usuário não é membro da empresa' using errcode = '42501';
  end if;

  -- Defesa extra: o prefixo da chave deve ser o empresa_id
  -- Ex.: name = '<empresa_id>/<produto_id>/arquivo.jpg'
  begin
    v_first_segment := (string_to_array(v_img.url, '/'))[1]::uuid;
  exception when others then
    raise exception '[RPC][DELETE_IMG] chave inválida para validação de empresa';
  end;

  if v_first_segment is distinct from v_empresa_id then
    raise exception '[RPC][DELETE_IMG] chave não pertence à empresa' using errcode = '42501';
  end if;

  -- Remove do Storage (ignora se não existir)
  perform storage.delete('product_images', array[v_img.url]);

  -- Remove do banco
  delete from public.produto_imagens where id = p_image_id;
end;
$$;

grant execute on function public.delete_product_image(uuid) to authenticated;
