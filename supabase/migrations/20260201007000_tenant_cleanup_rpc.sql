/*
  RPC: tenant_cleanup (DEV parity)

  Usado pela Edge Function `tenant-cleanup`.
  Implementação baseada no legado, ajustada para `empresa_usuarios.status` como TEXT.
*/

create table if not exists public._bak_empresa_usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid,
  user_id uuid,
  role text,
  role_id uuid,
  status text,
  is_principal boolean,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz not null default now(),
  deleted_by uuid
);

create or replace function public.tenant_cleanup(
  p_keep_email text,
  p_remove_active boolean default false,
  p_dry_run boolean default true
)
returns table (
  user_id uuid,
  email text,
  status text,
  empresa_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_empresa_id uuid;
begin
  if not (
    select (auth.jwt()->>'role' = 'authenticated')
    and public.has_permission_for_current_user('usuarios', 'manage')
  ) then
    raise exception 'PERMISSION_DENIED: Apenas administradores podem executar esta ação.';
  end if;

  select eu.empresa_id into v_target_empresa_id
  from public.empresa_usuarios eu
  join auth.users u on u.id = eu.user_id
  where lower(u.email) = lower(p_keep_email)
  limit 1;

  if v_target_empresa_id is null then
    raise exception 'TARGET_TENANT_NOT_FOUND: Usuário a ser preservado não encontrado em nenhuma empresa.';
  end if;

  create temp table users_to_remove as
  select
    eu.user_id as remove_user_id,
    (u.email)::text as remove_email,
    eu.status as remove_status,
    eu.empresa_id as remove_empresa_id
  from public.empresa_usuarios eu
  join auth.users u on u.id = eu.user_id
  where eu.empresa_id = v_target_empresa_id
    and lower(u.email) <> lower(p_keep_email)
    and (p_remove_active or eu.status = 'PENDING');

  if p_dry_run then
    return query
    select remove_user_id, remove_email, remove_status, remove_empresa_id from users_to_remove;
    drop table users_to_remove;
    return;
  end if;

  insert into public._bak_empresa_usuarios (empresa_id, user_id, role, role_id, status, is_principal, created_at, updated_at, deleted_by)
  select eu.empresa_id, eu.user_id, eu.role, eu.role_id, eu.status, eu.is_principal, eu.created_at, eu.updated_at, auth.uid()
  from public.empresa_usuarios eu
  join users_to_remove utr on utr.remove_user_id = eu.user_id
  where eu.empresa_id = v_target_empresa_id;

  delete from public.empresa_usuarios eu
  using users_to_remove utr
  where eu.user_id = utr.remove_user_id
    and eu.empresa_id = v_target_empresa_id;

  return query
  select remove_user_id, remove_email, remove_status, remove_empresa_id from users_to_remove;

  drop table users_to_remove;
end;
$$;

revoke all on function public.tenant_cleanup(text, boolean, boolean) from public;
grant execute on function public.tenant_cleanup(text, boolean, boolean) to authenticated;

