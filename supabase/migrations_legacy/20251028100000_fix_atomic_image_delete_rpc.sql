-- [RPC][MEDIA] Deleta registro de imagem após remoção no Storage
-- Segurança: confere membresia pela empresa do produto/da imagem
-- Idempotência: se já não existir, ERRO claro

-- 1. Limpa a função antiga se existir
drop function if exists public.delete_product_image(uuid);

-- 2. Cria a nova função apenas para deleção no DB
create or replace function public.delete_product_image_db(p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  -- encontra empresa da imagem
  select pi.empresa_id
    into v_empresa_id
    from public.produto_imagens pi
   where pi.id = p_image_id;

  if not found then
    raise exception '[RPC][DELETE_IMG_DB] imagem não encontrada' using errcode = 'no_data_found';
  end if;

  -- autorização por membresia
  if not public.is_user_member_of(v_empresa_id) then
    raise exception '[AUTH] usuário não é membro da empresa' using errcode = '42501';
  end if;

  -- apaga do DB (RLS ativo; como SECURITY DEFINER, validamos manualmente a empresa)
  delete from public.produto_imagens
   where id = p_image_id
     and empresa_id = v_empresa_id;

  if not found then
    raise exception '[RPC][DELETE_IMG_DB] registro já removido' using errcode = 'no_data_found';
  end if;
end;
$$;

grant execute on function public.delete_product_image_db(uuid) to authenticated;
