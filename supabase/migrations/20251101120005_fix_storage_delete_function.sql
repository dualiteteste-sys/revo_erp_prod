/*
          # [FIX] Corrige a função de deleção de imagens no Storage
          Substitui a função `delete_product_image` para usar a chamada correta `storage.delete_objects` do Supabase Storage. A chamada anterior `storage.delete` estava incorreta e causava erros. Nenhuma alteração nos dados existentes é feita.

          ## Query Description: "Esta operação corrige a lógica interna de uma função de banco de dados, sem impacto direto sobre os dados dos usuários. Ela garante que a exclusão de imagens de produtos funcione corretamente."
          
          ## Metadata:
          - Schema-Category: ["Structural"]
          - Impact-Level: ["Low"]
          - Requires-Backup: false
          - Reversible: false
          
          ## Structure Details:
          - Function: public.delete_product_image(uuid)
          
          ## Security Implications:
          - RLS Status: [N/A]
          - Policy Changes: [No]
          - Auth Requirements: [authenticated]
          
          ## Performance Impact:
          - Indexes: [N/A]
          - Triggers: [N/A]
          - Estimated Impact: [Nenhum impacto de performance esperado.]
          */
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

  -- Remove do Storage (CORREÇÃO AQUI)
  -- A função correta é storage.delete_objects
  perform storage.delete_objects('product_images', array[v_img.url]);

  -- Remove do banco
  delete from public.produto_imagens where id = p_image_id;
end;
$$;

grant execute on function public.delete_product_image(uuid) to authenticated;
