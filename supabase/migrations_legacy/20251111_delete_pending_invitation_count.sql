-- [RPC] delete_pending_invitation -> retorna contagem (int)
-- Segurança: SECURITY DEFINER, search_path fixo. RLS + policy de DELETE já existentes.

-- 0) Remover a versão anterior para permitir mudar o tipo de retorno
drop function if exists public.delete_pending_invitation(uuid);

-- 1) Recriar com retorno int (ROW_COUNT)
create or replace function public.delete_pending_invitation(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_can boolean;
  v_deleted int := 0;
begin
  -- Permissão: precisa poder gerenciar usuários da própria empresa
  select coalesce(public.has_permission('usuarios','manage'), false) into v_can;
  if not v_can then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  delete from public.empresa_usuarios
   where empresa_id = public.current_empresa_id()
     and user_id    = p_user_id
     and status     = 'PENDING';

  get diagnostics v_deleted = ROW_COUNT;
  return v_deleted; -- idempotente (0 quando nada foi removido)
end;
$$;

-- 2) Grants
revoke all on function public.delete_pending_invitation(uuid) from public;
grant execute on function public.delete_pending_invitation(uuid) to authenticated, service_role;

-- 3) Recarregar o schema do PostgREST
select pg_notify('pgrst','reload schema');
