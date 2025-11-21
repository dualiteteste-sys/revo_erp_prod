/*
# [FIX] list_users_for_current_empresa - cast explícito de email para text
- Mantém SD + search_path; keyset por created_at; limite hard de 100
*/

-- =====================================================================
-- FIX: list_users_for_current_empresa - cast explícito de email para text
-- Mantém SD + search_path; keyset por created_at; limite hard de 100
-- =====================================================================

drop function if exists public.list_users_for_current_empresa(text,text[],text[],int,text);

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
    (u.email)::text                         as email,         -- <<< FIX AQUI
    (u.raw_user_meta_data->>'name')         as name,
    r.slug::text                            as role,
    eu.status::text                         as status,
    u.invited_at,
    u.last_sign_in_at,
    u.created_at,
    u.updated_at
  from public.empresa_usuarios eu
  join auth.users u        on u.id = eu.user_id
  left join public.roles r on r.id = eu.role_id
  where eu.empresa_id = v_empresa_id
    and (p_q is null or u.email ilike '%'||p_q||'%' or (u.raw_user_meta_data->>'name') ilike '%'||p_q||'%')
    and (p_role   is null or r.slug = any(p_role))
    and (p_status is null or eu.status::text = any(p_status))
    and (v_after_ts is null or eu.created_at < v_after_ts)
  order by eu.created_at desc, eu.user_id desc
  limit least(coalesce(p_limit,20), 100);
end;
$$;

revoke all on function public.list_users_for_current_empresa(text,text[],text[],int,text) from public;
grant execute on function public.list_users_for_current_empresa(text,text[],text[],int,text) to authenticated, service_role;

-- PostgREST: recarregar schema
select pg_notify('pgrst','reload schema');
