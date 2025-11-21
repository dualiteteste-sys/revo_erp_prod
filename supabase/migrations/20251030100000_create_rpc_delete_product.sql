-- Crie… RPC segura para deletar produto do usuário atual
-- Requisitos: public.is_user_member_of(uuid) já existente
-- Padrões: RLS por operação nas tabelas, search_path seguro

create or replace function public.delete_product_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  -- Descobre a empresa do produto alvo
  select p.empresa_id into v_empresa_id
  from public.produtos p
  where p.id = p_id;

  -- Não vaza existência do recurso: acesso negado se não for membro
  if v_empresa_id is null or not public.is_user_member_of(v_empresa_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- DELETE estritamente escopado à empresa do usuário
  delete from public.produtos
  where id = p_id
    and empresa_id = v_empresa_id;

  -- Log leve para auditoria (consumível por listener opcional)
  perform pg_notify('app_log', '[RPC] [DELETE_PRODUCT] ' || p_id::text);
end;
$$;

-- Permissões mínimas
revoke all on function public.delete_product_for_current_user(uuid) from public;
grant execute on function public.delete_product_for_current_user(uuid) to authenticated;
