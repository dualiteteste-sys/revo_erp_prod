/*
# [Feature/Security] Excluir convite pendente com RLS (idempotente)
- Habilita/força RLS (se necessário) em public.empresa_usuarios
- Adiciona policy de DELETE restrita a convites PENDING + RBAC (idempotente)
- Cria RPC SD `delete_pending_invitation(p_user_id uuid)` com checagem de permissão
- search_path fixo; notifica PostgREST

## Segurança
- RLS: ENABLE + FORCE garantidos
- Policies: DELETE somente para authenticated quando:
  empresa_id = current_empresa_id() AND has_permission('usuarios','manage') AND status = 'PENDING'
- Não afeta SELECT/INSERT/UPDATE existentes
*/

-- 0) Garantir RLS habilitado/forçado (idempotente)
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='empresa_usuarios' and c.relkind='r' and c.relrowsecurity=false
  ) then
    execute 'alter table public.empresa_usuarios enable row level security';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='empresa_usuarios' and c.relkind='r' and c.relforcerowsecurity=false
  ) then
    execute 'alter table public.empresa_usuarios force row level security';
  end if;
end
$$;

-- 1) Policy de DELETE para convites pendentes + RBAC (idempotente)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='empresa_usuarios'
      and policyname='empresa_usuarios_delete_manage_pending'
  ) then
    execute $p$
      create policy empresa_usuarios_delete_manage_pending
      on public.empresa_usuarios
      for delete
      to authenticated
      using (
        empresa_id = public.current_empresa_id()
        and public.has_permission_for_current_user('usuarios','manage')
        and status = 'PENDING'
      );
    $p$;
  end if;
end
$$;

-- 2) RPC: Excluir um convite pendente (remove o vínculo da empresa)
create or replace function public.delete_pending_invitation(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Checagem explícita de permissão (camada adicional além da policy)
  if not public.has_permission_for_current_user('usuarios','manage') then
    raise exception 'PERMISSION_DENIED: Você não tem permissão para gerenciar usuários.';
  end if;

  -- Exclui apenas convites pendentes da empresa atual
  delete from public.empresa_usuarios
   where empresa_id = public.current_empresa_id()
     and user_id = p_user_id
     and status = 'PENDING';

  -- Idempotente: sem erro quando não há linha
end;
$$;

revoke all on function public.delete_pending_invitation(uuid) from public;
grant execute on function public.delete_pending_invitation(uuid) to authenticated, service_role;

-- 3) Recarregar schema do PostgREST
select pg_notify('pgrst','reload schema');
