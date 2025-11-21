-- =============================================================================
-- [Feature] RPC para limpeza de usuários de um tenant
-- =============================================================================

-- Permite pré-visualizar (dry_run = true) ou executar (dry_run = false) a remoção
-- de vínculos de usuários de uma empresa, preservando um e-mail chave.
-- Faz backup dos registros removidos na tabela public._bak_empresa_usuarios.

create or replace function public.tenant_cleanup(
  p_keep_email text,
  p_remove_active boolean default false,
  p_dry_run boolean default true
)
returns table (
  user_id uuid,
  email text,
  status public.user_status_in_empresa,
  empresa_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_empresa_id uuid;
begin
  -- Validação de permissão: apenas usuários com permissão de 'manage' em 'usuarios'
  if not (
    select (auth.jwt()->>'role' = 'authenticated')
    and public.has_permission_for_current_user('usuarios', 'manage')
  ) then
    raise exception 'PERMISSION_DENIED: Apenas administradores podem executar esta ação.';
  end if;

  -- 1) Descobrir tenant alvo a partir do keep_email
  select eu.empresa_id into v_target_empresa_id
  from public.empresa_usuarios eu
  join auth.users u on u.id = eu.user_id
  where lower(u.email) = lower(p_keep_email)
  limit 1;

  if v_target_empresa_id is null then
    raise exception 'TARGET_TENANT_NOT_FOUND: Usuário a ser preservado não encontrado em nenhuma empresa.';
  end if;

  -- 2) Identificar usuários a serem removidos
  create temp table users_to_remove as
  select
    eu.user_id as remove_user_id,
    u.email as remove_email,
    eu.status as remove_status,
    eu.empresa_id as remove_empresa_id
  from public.empresa_usuarios eu
  join auth.users u on u.id = eu.user_id
  where eu.empresa_id = v_target_empresa_id
    and lower(u.email) <> lower(p_keep_email)
    and (p_remove_active or eu.status = 'PENDING');

  -- 3) Se for dry run, apenas retorna a lista
  if p_dry_run then
    return query
    select remove_user_id, remove_email, remove_status, remove_empresa_id from users_to_remove;
    drop table users_to_remove;
    return;
  end if;

  -- 4) Se for execução, faz backup e delete
  -- Garantir tabela de backup
  create table if not exists public._bak_empresa_usuarios (
    like public.empresa_usuarios including all,
    deleted_at timestamptz not null default now(),
    deleted_by uuid references auth.users(id)
  );

  -- Inserir no backup
  insert into public._bak_empresa_usuarios (empresa_id, user_id, role_id, status, created_at, is_principal, deleted_by)
  select eu.empresa_id, eu.user_id, eu.role_id, eu.status, eu.created_at, eu.is_principal, auth.uid()
  from public.empresa_usuarios eu
  join users_to_remove utr on utr.remove_user_id = eu.user_id
  where eu.empresa_id = v_target_empresa_id;

  -- Remover vínculos
  delete from public.empresa_usuarios eu
  using users_to_remove utr
  where eu.user_id = utr.remove_user_id
    and eu.empresa_id = v_target_empresa_id;

  -- Retornar a lista dos que foram removidos
  return query
  select remove_user_id, remove_email, remove_status, remove_empresa_id from users_to_remove;

  -- Limpar tabela temporária
  drop table users_to_remove;
end;
$$;

grant execute on function public.tenant_cleanup(text, boolean, boolean) to authenticated;
