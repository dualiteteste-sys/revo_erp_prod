/*
  Tenant membership alignment (DEV parity)

  PROD estava sem colunas/RPCs usadas pelo app e pelas Edge Functions de convite:
  - public.empresa_usuarios.status (PENDING/ACTIVE/INACTIVE/SUSPENDED)
  - public.empresa_usuarios.is_principal
  - RPCs: accept_invite_for_current_user, list_users_for_current_empresa_v2, count_users_for_current_empresa,
          deactivate_user_for_current_empresa, reactivate_user_for_current_empresa,
          delete_pending_invitation, update_user_role_for_current_empresa

  Nota: usamos `status` como TEXT (não enum) para evitar acoplamento e manter compatibilidade
  com o código JS (Edge Functions) que envia strings.
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Schema: empresa_usuarios.status + is_principal
-- ---------------------------------------------------------------------------

alter table public.empresa_usuarios
  add column if not exists status text;

-- Em alguns projetos antigos `status` era enum (ex.: user_status_in_empresa).
-- Para manter compatibilidade, garantimos que os valores existam no enum.
do $$
declare
  v_udt_name text;
  v_type_schema text;
  v_is_enum boolean := false;
begin
  select c.udt_name
    into v_udt_name
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'empresa_usuarios'
    and c.column_name = 'status'
  limit 1;

  if v_udt_name is not null and v_udt_name <> 'text' then
    select n.nspname,
           (t.typtype = 'e')
      into v_type_schema,
           v_is_enum
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = v_udt_name
    limit 1;

    if coalesce(v_is_enum, false) then
      execute format('alter type %I.%I add value if not exists %L', v_type_schema, v_udt_name, 'ACTIVE');
      execute format('alter type %I.%I add value if not exists %L', v_type_schema, v_udt_name, 'PENDING');
      execute format('alter type %I.%I add value if not exists %L', v_type_schema, v_udt_name, 'INACTIVE');
      execute format('alter type %I.%I add value if not exists %L', v_type_schema, v_udt_name, 'SUSPENDED');
    end if;
  end if;
end$$;

update public.empresa_usuarios
set status = coalesce(status, 'ACTIVE')
where status is null;

alter table public.empresa_usuarios
  alter column status set not null;

alter table public.empresa_usuarios
  alter column status set default 'ACTIVE';

alter table public.empresa_usuarios
  add column if not exists is_principal boolean not null default false;

-- Constraint (idempotente)
alter table public.empresa_usuarios
  drop constraint if exists empresa_usuarios_status_check;

alter table public.empresa_usuarios
  add constraint empresa_usuarios_status_check
  check (status in ('ACTIVE','PENDING','INACTIVE','SUSPENDED'));

create index if not exists idx_empresa_usuarios_empresa_status_role
  on public.empresa_usuarios (empresa_id, status, role_id, created_at);

-- ---------------------------------------------------------------------------
-- 2) RPC: accept invite
-- ---------------------------------------------------------------------------

create or replace function public.accept_invite_for_current_user(p_empresa_id uuid)
returns table (
  empresa_id uuid,
  user_id uuid,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_exists boolean;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select true
    into v_exists
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa_id
    and eu.user_id = v_user_id
    and eu.status in ('PENDING','ACTIVE')
  limit 1;

  if not coalesce(v_exists, false) then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  update public.empresa_usuarios eu
     set status = 'ACTIVE',
         updated_at = now()
   where eu.empresa_id = p_empresa_id
     and eu.user_id = v_user_id
     and eu.status <> 'ACTIVE';

  -- Define/atualiza empresa ativa do usuário
  insert into public.user_active_empresa (user_id, empresa_id, updated_at)
  values (v_user_id, p_empresa_id, now())
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = excluded.updated_at;

  return query
  select eu.empresa_id, eu.user_id, eu.status
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa_id
    and eu.user_id = v_user_id;
end;
$$;

revoke all on function public.accept_invite_for_current_user(uuid) from public;
grant execute on function public.accept_invite_for_current_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPCs: list/count/manage users (UI)
-- ---------------------------------------------------------------------------

create or replace function public.count_users_for_current_empresa(
  p_q text default null,
  p_status text[] default null,
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
  v_role_ids uuid[] := array[]::uuid[];
  v_apply_role boolean := false;
begin
  if v_empresa is null then
    return 0;
  end if;

  if p_role is not null and array_length(p_role, 1) > 0 then
    v_apply_role := true;
    select coalesce(array_agg(id), array[]::uuid[]) into v_role_ids
    from public.roles
    where upper(slug) = any (select upper(x) from unnest(p_role) x);
  end if;

  return (
    select count(*)
    from public.empresa_usuarios eu
    join auth.users u on u.id = eu.user_id
    left join public.roles r on r.id = eu.role_id
    where eu.empresa_id = v_empresa
      and (
        p_q is null
        or (u.email)::text ilike '%' || p_q || '%'
        or (u.raw_user_meta_data->>'name')::text ilike '%' || p_q || '%'
      )
      and (p_status is null or eu.status = any(p_status))
      and (
        not v_apply_role
        or eu.role_id = any(v_role_ids)
        or (r.slug is not null and r.slug = any (select upper(x) from unnest(p_role) x))
      )
  );
end;
$$;

revoke all on function public.count_users_for_current_empresa(text, text[], text[]) from public;
grant execute on function public.count_users_for_current_empresa(text, text[], text[]) to authenticated;

create or replace function public.list_users_for_current_empresa_v2(
  p_limit int default 25,
  p_offset int default 0,
  p_q text default null,
  p_status text[] default null,
  p_role text[] default null
)
returns table (
  user_id uuid,
  email text,
  name text,
  role text,
  status text,
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
  v_role_ids uuid[] := array[]::uuid[];
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
    where upper(slug) = any (select upper(x) from unnest(p_role) x);
  end if;

  return query
    select
      eu.user_id,
      (u.email)::text                               as email,
      (u.raw_user_meta_data->>'name')::text         as name,
      coalesce((r.slug)::text, eu.role::text)       as role,
      eu.status                                     as status,
      (eu.created_at)::timestamptz                  as invited_at,
      u.last_sign_in_at                             as last_sign_in_at
    from public.empresa_usuarios eu
    join auth.users u on u.id = eu.user_id
    left join public.roles r on r.id = eu.role_id
    where eu.empresa_id = v_empresa
      and (
        p_q is null
        or (u.email)::text ilike '%' || p_q || '%'
        or (u.raw_user_meta_data->>'name')::text ilike '%' || p_q || '%'
      )
      and (p_status is null or eu.status = any(p_status))
      and (
        not v_apply_role
        or eu.role_id = any(v_role_ids)
        or (r.slug is not null and r.slug = any (select upper(x) from unnest(p_role) x))
      )
    order by eu.created_at desc, eu.user_id desc
    limit v_limit
    offset v_offset;
end;
$$;

revoke all on function public.list_users_for_current_empresa_v2(int, int, text, text[], text[]) from public;
grant execute on function public.list_users_for_current_empresa_v2(int, int, text, text[], text[]) to authenticated;

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
     set status = 'INACTIVE',
         updated_at = now()
   where empresa_id = public.current_empresa_id()
     and user_id = p_user_id
     and status <> 'INACTIVE';
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
     set status = 'ACTIVE',
         updated_at = now()
   where empresa_id = public.current_empresa_id()
     and user_id = p_user_id
     and status <> 'ACTIVE';
end;
$$;

revoke all on function public.reactivate_user_for_current_empresa(uuid) from public;
grant execute on function public.reactivate_user_for_current_empresa(uuid) to authenticated;

create or replace function public.delete_pending_invitation(p_user_id uuid)
returns int
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_count int;
begin
  if not public.has_permission_for_current_user('usuarios','manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.empresa_usuarios
   where empresa_id = public.current_empresa_id()
     and user_id = p_user_id
     and status = 'PENDING';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.delete_pending_invitation(uuid) from public;
grant execute on function public.delete_pending_invitation(uuid) to authenticated;

create or replace function public.update_user_role_for_current_empresa(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_role_id uuid;
begin
  if not public.has_permission_for_current_user('usuarios','manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select id into v_role_id
  from public.roles
  where upper(slug) = upper(p_role)
  limit 1;

  if v_role_id is null then
    raise exception 'INVALID_ROLE_SLUG';
  end if;

  update public.empresa_usuarios
     set role_id = v_role_id,
         role = lower(p_role),
         updated_at = now()
   where empresa_id = public.current_empresa_id()
     and user_id = p_user_id;
end;
$$;

revoke all on function public.update_user_role_for_current_empresa(uuid, text) from public;
grant execute on function public.update_user_role_for_current_empresa(uuid, text) to authenticated;

select pg_notify('pgrst','reload schema');

COMMIT;
