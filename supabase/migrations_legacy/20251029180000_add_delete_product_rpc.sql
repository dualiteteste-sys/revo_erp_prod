-- [SECURITY] Cria RPC para deleção segura de produtos
-- Substitui o DELETE direto no frontend por uma chamada de função
-- que valida a membresia do usuário na empresa do produto.

create or replace function public.delete_product_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  -- Busca a empresa do produto a ser deletado
  select empresa_id into v_empresa_id from public.produtos where id = p_id;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  -- Valida se o usuário atual pertence à empresa do produto
  if not public.is_user_member_of(v_empresa_id) then
    raise exception 'Acesso negado. Usuário não pertence à empresa do produto.';
  end if;

  -- Deleta o produto
  delete from public.produtos where id = p_id;
end;
$$;

grant execute on function public.delete_product_for_current_user(uuid) to authenticated;
