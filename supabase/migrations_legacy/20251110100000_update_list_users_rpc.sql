/*
[Refactor] Melhora a listagem de usuários com filtros e paginação

- Cria a função `list_users_for_current_empresa_v2` que suporta busca por texto, status e papel.
- Cria a função `count_users_for_current_empresa` para uma paginação precisa.
- Adiciona RPCs para desativar, reativar e deletar convites pendentes.
- Remove a v1 da função de listagem para evitar confusão.
*/

-- 1. Drop a função antiga se existir
drop function if exists public.list_users_for_current_empresa_v1(int) cascade;

-- 2. Função de contagem com filtros
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
  v_role_ids uuid[];
begin
  if v_empresa is null then return 0; end if;

  if p_role is not null and array_length(p_role, 1) > 0 then
    select array_agg(id) into v_role_ids from public.roles where slug = any(p_role);
  end if;

  return (
    select count(*)
    from public.empresa_usuarios eu
    join auth.users u on u.id = eu.user_id
    where eu.empresa_id = v_empresa
      and (p_q is null or u.email ilike '%' || p_q || '%' or u.raw_user_meta_data->>'name' ilike '%' || p_q || '%')
      and (p_status is null or eu.status = any(p_status))
      and (v_role_ids is null or eu.role_id = any(v_role_ids))
  );
end;
$$;
revoke all on function public.count_users_for_current_empresa(text, public.user_status_in_empresa[], text[]) from public;
grant execute on function public.count_users_for_current_empresa(text, public.user_status_in_empresa[], text[]) to authenticated;


-- 3. Função de listagem com filtros e paginação
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
  v_role_ids uuid[];
begin
  if v_empresa is null then return; end if;

  if p_role is not null and array_length(p_role, 1) > 0 then
    select array_agg(id) into v_role_ids from public.roles where slug = any(p_role);
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
      and (v_role_ids is null or eu.role_id = any(v_role_ids))
    order by eu.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
revoke all on function public.list_users_for_current_empresa_v2(int, int, text, public.user_status_in_empresa[], text[]) from public;
grant execute on function public.list_users_for_current_empresa_v2(int, int, text, public.user_status_in_empresa[], text[]) to authenticated;


-- 4. RPCs de gerenciamento
create or replace function public.deactivate_user_for_current_empresa(p_user_id uuid)
returns void as $$
begin
  if not public.has_permission_for_current_user('usuarios', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  update public.empresa_usuarios set status = 'INACTIVE' where user_id = p_user_id and empresa_id = public.current_empresa_id();
end;
$$ language plpgsql security definer;
grant execute on function public.deactivate_user_for_current_empresa(uuid) to authenticated;


create or replace function public.reactivate_user_for_current_empresa(p_user_id uuid)
returns void as $$
begin
  if not public.has_permission_for_current_user('usuarios', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  update public.empresa_usuarios set status = 'ACTIVE' where user_id = p_user_id and empresa_id = public.current_empresa_id();
end;
$$ language plpgsql security definer;
grant execute on function public.reactivate_user_for_current_empresa(uuid) to authenticated;


create or replace function public.delete_pending_invitation(p_user_id uuid)
returns void as $$
begin
  if not public.has_permission_for_current_user('usuarios', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  delete from public.empresa_usuarios where user_id = p_user_id and empresa_id = public.current_empresa_id() and status = 'PENDING';
end;
$$ language plpgsql security definer;
grant execute on function public.delete_pending_invitation(uuid) to authenticated;
