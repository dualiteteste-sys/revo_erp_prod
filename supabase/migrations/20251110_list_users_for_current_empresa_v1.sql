/*
[Refactor Seguro] Listagem com filtros/paginação + RPCs de gerenciamento
- Mantém RLS por operação
- SECURITY DEFINER somente nas leituras que precisam de auth.users
- search_path fixo: pg_catalog, public
*/

-- 0) Remover versão antiga
drop function if exists public.list_users_for_current_empresa_v1(int) cascade;

-- 1) Contagem com filtros (SECURITY DEFINER só para ler auth.users)
create or replace function public.count_users_for_current_empresa(
  p_q text default null,
  p_status public.user_status_in_empresa[] default null,
  p_role text[] default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_role_ids uuid[] := array[]::uuid[]; -- nunca NULL
  v_apply_role boolean := false;
begin
  if v_empresa is null then
    return 0;
  end if;

  if p_role is not null and array_length(p_role, 1) > 0 then
    v_apply_role := true;
    select coalesce(array_agg(id), array[]::uuid[]) into v_role_ids
    from public.roles
    where slug = any(p_role);
  end if;

  return (
    select count(*)
    from public.empresa_usuarios eu
    join auth.users u on u.id = eu.user_id
    where eu.empresa_id = v_empresa
      and (p_q is null or u.email ilike '%' || p_q || '%' or u.raw_user_meta_data->>'name' ilike '%' || p_q || '%')
      and (p_status is null or eu.status = any(p_status))
      and (not v_apply_role or eu.role_id = any(v_role_ids))
  );
end;
$$;
revoke all on function public.count_users_for_current_empresa(text, public.user_status_in_empresa[], text[]) from public;
grant execute on function public.count_users_for_current_empresa(text, public.user_status_in_empresa[], text[]) to authenticated;

-- 2) Listagem com filtros/paginação (SECURITY DEFINER para ler auth.users)
create or replace function public.list_users_for_current_empresa_v2(
  p_limit int default 25,
  p_offset int default 0,
  p_q text default null,
  p_status public.user_status_in_empresa[] default null,
  p_role text[] default null
)
returns table (
  user_id uuid,
  email text,
  name text,
  role text,
  status public.user_status_in_empresa,
  invited_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_role_ids uuid[] := array[]::uuid[]; -- nunca NULL
  v_apply_role boolean := false;
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_empresa is null then
    return;
  end if;

  if p_role is not null and array_length(p_role, 1) > 0 then
    v_apply_role := true;
    select coalesce(array_agg(id), array[]::uuid[]) into v_role_ids
    from public.roles
    where slug = any(p_role);
  end if;

  return query
    select
      eu.user_id,
      u.email,
      u.raw_user_meta_data->>'name' as name,
      r.slug as role,
      eu.status,
      eu.created_at as invited_at,
      u.last_sign_in_at
    from public.empresa_usuarios eu
    join auth.users u on u.id = eu.user_id
    left join public.roles r on r.id = eu.role_id
    where eu.empresa_id = v_empresa
      and (p_q is null or u.email ilike '%' || p_q || '%' or u.raw_user_meta_data->>'name' ilike '%' || p_q || '%')
      and (p_status is null or eu.status = any(p_status))
      and (not v_apply_role or eu.role_id = any(v_role_ids))
    order by eu.created_at desc, eu.user_id desc
    limit v_limit
    offset v_offset;
end;
$$;
revoke all on function public.list_users_for_current_empresa_v2(int, int, text, public.user_status_in_empresa[], text[]) from public;
grant execute on function public.list_users_for_current_empresa_v2(int, int, text, public.user_status_in_empresa[], text[]) to authenticated;

-- 3) RPCs de gerenciamento (INVOCADOR: respeitam RLS + checagem explícita)
create or replace function public.deactivate_user_for_current_empresa(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if not public.has_permission_for_current_user('usuarios','manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.empresa_usuarios
     set status = 'SUSPENDED', updated_at = now()
   where empresa_id = public.current_empresa_id()
     and user_id = p_user_id
     and status <> 'SUSPENDED';
end;
$$;
revoke all on function public.deactivate_user_for_current_empresa(uuid) from public;
grant execute on function public.deactivate_user_for_current_empresa(uuid) to authenticated;

create or replace function public.reactivate_user_for_current_empresa(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if not public.has_permission_for_current_user('usuarios','manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.empresa_usuarios
     set status = 'ACTIVE', updated_at = now()
   where empresa_id = public.current_empresa_id()
     and user_id = p_user_id
     and status <> 'ACTIVE';
end;
$$;
revoke all on function public.reactivate_user_for_current_empresa(uuid) from public;
grant execute on function public.reactivate_user_for_current_empresa(uuid) to authenticated;

create or replace function public.delete_pending_invitation(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if not public.has_permission_for_current_user('usuarios','manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.empresa_usuarios
   where empresa_id = public.current_empresa_id()
     and user_id = p_user_id
     and status = 'PENDING';
end;
$$;
revoke all on function public.delete_pending_invitation(uuid) from public;
grant execute on function public.delete_pending_invitation(uuid) to authenticated;

-- 4) Índices recomendados (idempotentes)
create index if not exists idx_empresa_usuarios_empresa_status_role on public.empresa_usuarios (empresa_id, status, role_id, created_at);
