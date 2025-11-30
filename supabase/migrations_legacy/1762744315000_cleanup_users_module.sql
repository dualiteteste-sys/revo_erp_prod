/*
[CleanUp] Remoção módulo de Usuários (RPCs/policies auxiliares)
- DROP FUNCTIONS (se existirem):
  list_users_for_current_empresa
  update_user_role_for_current_empresa
  invite_user_to_current_empresa
  delete_pending_invitation
- DROP POLICIES auxiliares em public.empresa_usuarios (apenas as criadas para o módulo):
  empresa_usuarios_insert_manage_own_company
  empresa_usuarios_update_manage_own_company
  empresa_usuarios_delete_manage_pending
*/

-- Funções
drop function if exists public.list_users_for_current_empresa(text,text[],text[],int,text) cascade;
drop function if exists public.update_user_role_for_current_empresa(text,uuid) cascade;
drop function if exists public.invite_user_to_current_empresa(text,text) cascade;
drop function if exists public.delete_pending_invitation(uuid) cascade;

-- Policies auxiliares do módulo (mantém SELECTs já existentes!)
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='empresa_usuarios' and policyname='empresa_usuarios_insert_manage_own_company') then
    execute 'drop policy empresa_usuarios_insert_manage_own_company on public.empresa_usuarios';
  end if;

  if exists (select 1 from pg_policies where schemaname='public' and tablename='empresa_usuarios' and policyname='empresa_usuarios_update_manage_own_company') then
    execute 'drop policy empresa_usuarios_update_manage_own_company on public.empresa_usuarios';
  end if;

  if exists (select 1 from pg_policies where schemaname='public' and tablename='empresa_usuarios' and policyname='empresa_usuarios_delete_manage_pending') then
    execute 'drop policy empresa_usuarios_delete_manage_pending on public.empresa_usuarios';
  end if;
end
$$;

-- Reload PostgREST
select pg_notify('pgrst','reload schema');
