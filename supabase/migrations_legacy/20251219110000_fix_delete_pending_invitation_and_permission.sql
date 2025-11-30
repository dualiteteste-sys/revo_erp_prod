-- MIG: corrigir RPC delete_pending_invitation e wrapper has_permission
-- Segurança: usar SECURITY DEFINER + search_path fixo; GRANT para authenticated; NOTIFY pgrst.

/*
# [Fix] Permissões e Remoção de Convites
Esta migração corrige a lógica de remoção de convites pendentes e adiciona um wrapper de compatibilidade para verificação de permissões.

## Query Description:
1.  **has_permission wrapper**: Cria uma função de compatibilidade `public.has_permission` que delega a chamada para `public.has_permission_for_current_user`. Isso garante que as RLS policies antigas continuem funcionando sem precisar de reescrita imediata. É uma operação segura e não afeta dados.
2.  **RLS em empresa_usuarios**: Garante que a RLS esteja habilitada e forçada na tabela `empresa_usuarios`, o que é uma boa prática de segurança.
3.  **Política de DELETE**: Cria uma política de segurança (RLS) que permite a exclusão de um vínculo em `empresa_usuarios` somente se o status for 'PENDING' e o usuário que executa a ação tiver a permissão 'usuarios:manage'. Isso impede a remoção acidental de usuários ativos.
4.  **RPC delete_pending_invitation**: Cria a função principal que encapsula a lógica de remoção. Ela verifica a permissão internamente e executa o DELETE, retornando o número de linhas afetadas. É segura e idempotente.

## Metadata:
- Schema-Category: ["Structural", "Security"]
- Impact-Level: ["Low"]
- Requires-Backup: false
- Reversible: true (as políticas e funções podem ser revertidas manualmente)

## Structure Details:
- Funções afetadas: `public.has_permission`, `public.delete_pending_invitation`
- Tabelas afetadas: `public.empresa_usuarios` (política de RLS)

## Security Implications:
- RLS Status: Habilitada e Forçada em `empresa_usuarios`.
- Policy Changes: Adiciona a política `delete_pending_invites_only_with_permission`.
- Auth Requirements: A execução da RPC requer um usuário autenticado com a permissão `usuarios:manage`.

## Performance Impact:
- Indexes: Nenhum índice novo.
- Triggers: Nenhum trigger novo.
- Estimated Impact: Mínimo. As operações são leves e afetam apenas ações de gerenciamento de usuários.
*/

-- 1) Wrapper de compatibilidade para policies que usam has_permission(resource, action)
--    Direciona para has_permission_for_current_user(resource, action)
create or replace function public.has_permission(p_resource text, p_action text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.has_permission_for_current_user(p_resource, p_action);
$$;

revoke all on function public.has_permission(text, text) from public;
grant execute on function public.has_permission(text, text) to authenticated, service_role;

-- 2) Garantir RLS habilitado e forçado em empresa_usuarios (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_tables t
    join pg_namespace n on n.oid = t.schemaname::regnamespace
    where n.nspname='public' and t.tablename='empresa_usuarios'
  ) then
    raise notice 'Tabela public.empresa_usuarios não encontrada — pule se não aplicável.';
    return;
  end if;

  alter table if exists public.empresa_usuarios enable row level security;
  -- force_rls apenas se suportado
  begin
    alter table if exists public.empresa_usuarios force row level security;
  exception when others then
    -- versões antigas de PG podem não suportar force
    raise notice 'FORCE RLS indisponível, seguindo sem.';
  end;
end$$;

-- 3) Policy de DELETE para convites pendentes (idempotente)
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='empresa_usuarios' and policyname='delete_pending_invites_only_with_permission'
  ) then
    drop policy if exists delete_pending_invites_only_with_permission on public.empresa_usuarios;
  end if;

  execute $p$
    create policy delete_pending_invites_only_with_permission
    on public.empresa_usuarios
    for delete
    to authenticated
    using (
      empresa_id = public.current_empresa_id()
      and status = 'PENDING'
      and public.has_permission('usuarios','manage')
    );
  $p$;
end$$;

-- 4) RPC: delete_pending_invitation(p_user_id uuid) → retorna int (linhas removidas)
drop function if exists public.delete_pending_invitation(uuid);

create or replace function public.delete_pending_invitation(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted int := 0;
begin
  -- Checagem explícita extra (além da policy)
  if not public.has_permission('usuarios','manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.empresa_usuarios eu
   where eu.empresa_id = public.current_empresa_id()
     and eu.user_id    = p_user_id
     and eu.status     = 'PENDING';

  get diagnostics v_deleted = ROW_COUNT;
  return v_deleted;  -- idempotente: 0 se nada removido
end;
$$;

revoke all on function public.delete_pending_invitation(uuid) from public;
grant execute on function public.delete_pending_invitation(uuid) to authenticated, service_role;

-- 5) Recarregar schema no PostgREST
select pg_notify('pgrst','reload schema');
