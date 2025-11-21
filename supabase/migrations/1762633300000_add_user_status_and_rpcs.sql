/*
# [Fix &amp; Feature] empresa_Usuarios.status + RPCs (idempotente, seguro)
- ENUM public.user_status_in_empresa: ('ACTIVE','PENDING','INACTIVE')
- Coluna status em public.empresa_usuarios (DEFAULT 'PENDING')
- Backfill: usuários com login já realizado -&gt; 'ACTIVE'
- Índice para filtro: (empresa_id, status)
- RPC list_users_for_current_empresa: inclui status (da nova coluna) e invited_at correto (auth.users.invited_at)
- RPCs de ativação/desativação com checagem RBAC ('usuarios','manage')
- SD + search_path fixo; limites e keyset
*/

-- 0) Enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_status_in_empresa') then
    create type public.user_status_in_empresa as enum ('ACTIVE','PENDING','INACTIVE');
  end if;
end
$$;

-- 1) Coluna status em empresa_usuarios
alter table public.empresa_usuarios
  add column if not exists status public.user_status_in_empresa not null default 'PENDING';

comment on column public.empresa_usuarios.status
  is 'Status do usuário na empresa: PENDING (convidado), ACTIVE (ativo), INACTIVE (desativado pelo admin).';

-- 2) Backfill seguro: marcar ACTIVE quem já fez login
update public.empresa_usuarios eu
set status = 'ACTIVE'
from auth.users u
where eu.user_id = u.id
  and u.last_sign_in_at is not null
  and eu.status = 'PENDING';

-- 3) Índice para filtros/paginação
create index if not exists idx_empresa_usuarios__empresa_status
  on public.empresa_usuarios(empresa_id, status);

-- 4) RPC: listagem de usuários
drop function if exists public.list_users_for_current_empresa(text,text[],text[],integer,text);

create or replace function public.list_users_for_current_empresa(
  p_q      text        default null,
  p_role   text[]      default null,   -- slugs (OWNER/ADMIN/...)
  p_status text[]      default null,   -- 'PENDING' | 'ACTIVE' | 'INACTIVE'
  p_limit  int         default 20,
  p_after  text        default null    -- ISO string; parse p/ timestamptz
)
returns table(
  user_id uuid,
  email text,
  name text,
  role text,
  status text,
  invited_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_after_ts   timestamptz;
begin
  if p_after is not null then
    v_after_ts := p_after::timestamptz;
  end if;

  return query
  select
    eu.user_id,
    u.email,
    (u.raw_user_meta_data-&gt;&gt;'name') as name,
    r.slug::text as role,
    eu.status::text as status,
    u.invited_at,              -- convite real (não confundir com vínculo)
    u.last_sign_in_at,
    u.created_at,
    u.updated_at
  from public.empresa_usuarios eu
  join auth.users u        on u.id = eu.user_id
  left join public.roles r on r.id = eu.role_id
  where eu.empresa_id = v_empresa_id
    and (p_q is null or u.email ilike '%'||p_q||'%' or (u.raw_user_meta_data-&gt;&gt;'name') ilike '%'||p_q||'%')
    and (p_role   is null or r.slug = any(p_role))
    and (p_status is null or eu.status::text = any(p_status))
    and (v_after_ts is null or eu.created_at &lt; v_after_ts) -- keyset
  order by eu.created_at desc, eu.user_id desc
  limit least(coalesce(p_limit,20), 100);
end;
$$;

revoke all on function public.list_users_for_current_empresa(text,text[],text[],int,text) from public;
grant execute on function public.list_users_for_current_empresa(text,text[],text[],int,text) to authenticated, service_role;

-- 5) RPC: desativar usuário
create or replace function public.deactivate_user_for_current_empresa(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_target_role text;
begin
  if not public.has_permission_for_current_user('usuarios','manage') then
    raise exception 'PERMISSION_DENIED: Você não tem permissão para gerenciar usuários.';
  end if;

  select r.slug into v_target_role
  from public.empresa_usuarios eu
  left join public.roles r on r.id = eu.role_id
  where eu.user_id = p_user_id and eu.empresa_id = v_empresa_id;

  if v_target_role = 'OWNER' then
    raise exception 'ACTION_NOT_ALLOWED: Não é possível desativar o proprietário da empresa.';
  end if;

  update public.empresa_usuarios
     set status = 'INACTIVE'
   where user_id = p_user_id
     and empresa_id = v_empresa_id;
end;
$$;

revoke all on function public.deactivate_user_for_current_empresa(uuid) from public;
grant execute on function public.deactivate_user_for_current_empresa(uuid) to authenticated, service_role;

-- 6) RPC: reativar usuário
create or replace function public.reactivate_user_for_current_empresa(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if not public.has_permission_for_current_user('usuarios','manage') then
    raise exception 'PERMISSION_DENIED: Você não tem permissão para gerenciar usuários.';
  end if;

  update public.empresa_usuarios
     set status = 'ACTIVE'
   where user_id = p_user_id
     and empresa_id = v_empresa_id
     and status = 'INACTIVE';
end;
$$;

revoke all on function public.reactivate_user_for_current_empresa(uuid) from public;
grant execute on function public.reactivate_user_for_current_empresa(uuid) to authenticated, service_role;

-- 7) PostgREST: recarregar schema
select pg_notify('pgrst','reload schema');
