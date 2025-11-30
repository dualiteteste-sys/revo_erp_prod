/*
[RPCs] Usuários: atualizar papel e convidar usuário (idempotente, seguro)
- Cria/atualiza:
  - update_user_role_for_current_empresa(p_role text, p_user_id uuid) RETURNS void
  - invite_user_to_current_empresa(p_email text, p_role text) RETURNS jsonb
- Padrões: SECURITY DEFINER, SET search_path, valida RBAC, mapeia slug->role_id, garante >=1 OWNER.
*/

-- 1) RPC: atualizar papel de um usuário na empresa atual
drop function if exists public.update_user_role_for_current_empresa(text, uuid);

create or replace function public.update_user_role_for_current_empresa(
  p_role    text,        -- slug: OWNER | ADMIN | FINANCE | OPS | READONLY | ...
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_actor uuid := public.current_user_id();
  v_role_id uuid;
  v_old_role_slug text;
  v_owner_role_id uuid;
  v_other_owners int;
begin
  if v_empresa_id is null or v_actor is null then
    raise exception 'UNAUTHENTICATED_OR_NO_COMPANY';
  end if;

  if not public.has_permission_for_current_user('usuarios','manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Mapeia slug -> role_id
  select id into v_role_id
  from public.roles
  where slug = upper(p_role)
  limit 1;

  if v_role_id is null then
    raise exception 'INVALID_ROLE_SLUG: %', p_role;
  end if;

  -- Papel atual do alvo (se houver)
  select r.slug
    into v_old_role_slug
  from public.empresa_usuarios eu
  left join public.roles r on r.id = eu.role_id
  where eu.empresa_id = v_empresa_id
    and eu.user_id = p_user_id;

  -- Não permitir remover o ÚLTIMO OWNER
  select id into v_owner_role_id from public.roles where slug='OWNER';
  if v_owner_role_id is not null and (v_old_role_slug = 'OWNER') and (v_role_id <> v_owner_role_id) then
    select count(*) into v_other_owners
    from public.empresa_usuarios eu
    where eu.empresa_id = v_empresa_id
      and eu.user_id <> p_user_id
      and eu.role_id = v_owner_role_id;

    if coalesce(v_other_owners,0) = 0 then
      raise exception 'ACTION_NOT_ALLOWED: Empresa ficaria sem OWNER';
    end if;
  end if;

  -- Upsert do vínculo com novo role_id (não mexe em status)
  update public.empresa_usuarios
     set role_id = v_role_id
   where empresa_id = v_empresa_id
     and user_id = p_user_id;

  if not found then
    -- Se ainda não havia vínculo, cria como PENDING (ou ACTIVE se já logado)
    insert into public.empresa_usuarios (empresa_id, user_id, role_id, status)
    values (
      v_empresa_id, p_user_id, v_role_id,
      case when exists(select 1 from auth.users u where u.id = p_user_id and u.last_sign_in_at is not null)
           then 'ACTIVE'::public.user_status_in_empresa
           else 'PENDING'::public.user_status_in_empresa
      end
    )
    on conflict (empresa_id, user_id) do update
      set role_id = excluded.role_id;
  end if;
end
$$;

revoke all on function public.update_user_role_for_current_empresa(text, uuid) from public;
grant execute on function public.update_user_role_for_current_empresa(text, uuid) to authenticated, service_role;

-- 2) RPC: convidar/associar usuário por email na empresa atual
drop function if exists public.invite_user_to_current_empresa(text, text);

create or replace function public.invite_user_to_current_empresa(
  p_email text,
  p_role  text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_actor uuid := public.current_user_id();
  v_role_id uuid;
  v_uid uuid;
  v_was_created boolean := false;
  v_status public.user_status_in_empresa;
begin
  if v_empresa_id is null or v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'UNAUTHENTICATED_OR_NO_COMPANY');
  end if;

  if not public.has_permission_for_current_user('usuarios','manage') then
    return jsonb_build_object('ok', false, 'error', 'PERMISSION_DENIED');
  end if;

  if p_email is null or length(trim(p_email)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_EMAIL');
  end if;

  -- Mapeia slug -> role_id
  select id into v_role_id from public.roles where slug = upper(p_role) limit 1;
  if v_role_id is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ROLE_SLUG', 'role', p_role);
  end if;

  -- Procura usuário no auth.users
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;

  if v_uid is null then
    -- Não existe no auth -> frontend deve disparar invite via serviço
    return jsonb_build_object(
      'ok', true,
      'action', 'invite_needed',
      'email', lower(trim(p_email)),
      'role', upper(p_role),
      'message', 'Usuário não encontrado em auth.users; enviar convite via serviço e vincular após o signup.'
    );
  end if;

  -- Se existe, cria/atualiza vínculo
  v_status := case
                when exists(select 1 from auth.users u where u.id = v_uid and u.last_sign_in_at is not null)
                  then 'ACTIVE'::public.user_status_in_empresa
                else 'PENDING'::public.user_status_in_empresa
              end;

  insert into public.empresa_usuarios (empresa_id, user_id, role_id, status)
  values (v_empresa_id, v_uid, v_role_id, v_status)
  on conflict (empresa_id, user_id) do update
    set role_id = excluded.role_id
  returning (xmax = 0) into v_was_created;

  return jsonb_build_object(
    'ok', true,
    'action', 'linked',
    'created', v_was_created,
    'user_id', v_uid,
    'email', lower(trim(p_email)),
    'role', upper(p_role),
    'status', v_status::text
  );
end
$$;

revoke all on function public.invite_user_to_current_empresa(text, text) from public;
grant execute on function public.invite_user_to_current_empresa(text, text) to authenticated, service_role;

-- 3) Atualiza cache do PostgREST
select pg_notify('pgrst','reload schema');
