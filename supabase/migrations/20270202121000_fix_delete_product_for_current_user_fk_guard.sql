-- Fix (Produtos): exclusão deve ser segura quando o produto já foi utilizado (FKs em vendas/estoque/etc.).
-- Estado da arte: manter integridade referencial; quando houver dependências, bloquear exclusão com mensagem clara.

create or replace function public.delete_product_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  select empresa_id into v_empresa_id from public.produtos where id = p_id;
  if not found then
    raise exception 'Produto não encontrado';
  end if;

  if not public.is_user_member_of(v_empresa_id) then
    raise exception 'Acesso negado. Usuário não pertence à empresa do produto.';
  end if;

  begin
    delete from public.produtos where id = p_id;
  exception
    when foreign_key_violation then
      raise exception 'Não é possível excluir este produto porque ele já foi utilizado em outros módulos (ex.: vendas). Inative o produto em vez de excluir.';
  end;
end;
$$;

revoke all on function public.delete_product_for_current_user(uuid) from public;
grant execute on function public.delete_product_for_current_user(uuid) to authenticated;

