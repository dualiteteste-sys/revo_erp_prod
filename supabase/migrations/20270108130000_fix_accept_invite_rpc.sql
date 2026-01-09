/*
  Fix: RPC `public.accept_invite_for_current_user(p_empresa_id uuid)` faltante no PROD

  Sintoma:
  - Tela de convite (AcceptInvite / UpdatePassword) chama `supabase.rpc("accept_invite_for_current_user")`
  - PostgREST retorna PGRST202 "Could not find the function ... in the schema cache"

  Causa raiz:
  - A migration snapshot `20260227030000_align_dev_schema.sql` contém um `DROP FUNCTION ...accept_invite_for_current_user`
    e não recria a função, removendo-a do schema mesmo após `20260201000000_tenant_memberships_and_invites.sql`.

  Impacto:
  - Usuário convidado não consegue ativar o vínculo (PENDING → ACTIVE) e definir empresa ativa.

  Reversibilidade:
  - Recriação de função é reversível reaplicando a definição anterior (ou DROP FUNCTION).
*/

begin;

drop function if exists public.accept_invite_for_current_user(uuid);

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
grant execute on function public.accept_invite_for_current_user(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

