-- 1) Lista convites pendentes do usuário atual (RLS-friendly)
create or replace function public.list_pending_invites_for_current_user()
returns table (
  empresa_id uuid,
  empresa_name text,
  role_slug text,
  status text,
  invited_at timestamptz
)
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    eu.empresa_id,
    e.nome_razao_social as empresa_name,            -- <== corrigido: e.nome_razao_social
    r.slug as role_slug,
    eu.status::text as status,
    coalesce(u.invited_at, eu.created_at) as invited_at
  from public.empresa_usuarios eu
  join public.empresas e on e.id = eu.empresa_id
  left join public.roles r on r.id = eu.role_id
  left join auth.users u on u.id = eu.user_id
  where eu.user_id = public.current_user_id()
    and eu.status = 'PENDING'::public.user_status_in_empresa
  order by invited_at desc;
$$;

revoke all on function public.list_pending_invites_for_current_user() from public;
grant execute on function public.list_pending_invites_for_current_user() to authenticated;

-- 2) Aceita (ativa) um convite específico para a empresa informada (idempotente)
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

  -- Verifica se há convite pendente OU ativo (idempotência)
  select true
    into v_exists
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa_id
    and eu.user_id = v_user_id
    and eu.status in ('PENDING','ACTIVE');

  if not v_exists then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  -- Ativa o vínculo (idempotente)
  update public.empresa_usuarios eu
     set status = 'ACTIVE',
         updated_at = now()
   where eu.empresa_id = p_empresa_id
     and eu.user_id = v_user_id
     and eu.status <> 'ACTIVE';

  -- Define/atualiza empresa ativa do usuário (upsert)
  insert into public.user_active_empresa (user_id, empresa_id, updated_at)
  values (v_user_id, p_empresa_id, now())
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = excluded.updated_at;

  return query
  select eu.empresa_id, eu.user_id, eu.status::text
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa_id
    and eu.user_id = v_user_id;
end;
$$;

revoke all on function public.accept_invite_for_current_user(uuid) from public;
grant execute on function public.accept_invite_for_current_user(uuid) to authenticated;
