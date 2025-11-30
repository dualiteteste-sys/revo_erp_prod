-- Lista de usuários do tenant atual (multi-tenant, segura)
-- SECURITY DEFINER apenas para ler auth.users; filtro estrito por empresa atual.
-- search_path fixo, RLS preservada nas tabelas públicas.
-- Limite máximo 100 para evitar varreduras grandes.

create or replace function public.list_users_for_current_empresa_v1(
  p_limit int default 25
)
returns table (
  user_id uuid,
  email text,
  role_slug text,
  status text,
  joined_at timestamptz,
  invited_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if v_empresa is null then
    raise exception 'NO_ACTIVE_TENANT';
  end if;

  return query
    select
      eu.user_id,
      u.email,
      r.slug as role_slug,
      eu.status::text as status,
      eu.created_at as joined_at,
      u.invited_at,
      u.last_sign_in_at
    from public.empresa_usuarios eu
    left join public.roles r on r.id = eu.role_id
    left join auth.users u on u.id = eu.user_id
    where eu.empresa_id = v_empresa
    order by eu.created_at desc, eu.user_id desc
    limit v_limit;
end;
$$;

revoke all on function public.list_users_for_current_empresa_v1(int) from public;
grant execute on function public.list_users_for_current_empresa_v1(int) to authenticated;

-- Índice essencial (idempotente) para performance, caso não exista:
create index if not exists idx_empresa_usuarios_empresa on public.empresa_usuarios (empresa_id);
