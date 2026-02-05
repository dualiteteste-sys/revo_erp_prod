/*
  Fix (PROD): PGRST202 em set_active_empresa_for_current_user

  Sintoma (PostgREST):
  - 404 /rest/v1/rpc/set_active_empresa_for_current_user
  - "Could not find the function ... in the schema cache" (PGRST202)

  Causa provável:
  - Drift ou sequência de migrations em ambiente remoto deixou a função ausente.
  - Sem essa RPC, o frontend não consegue persistir a empresa ativa.

  Solução:
  - (Re)cria a RPC `public.set_active_empresa_for_current_user(p_empresa_id uuid)` com validação
    de membership (anti-tenant-leak) e reload do schema cache.
*/

begin;

create or replace function public.set_active_empresa_for_current_user(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_empresa_id is null then
    delete from public.user_active_empresa where user_id = v_user_id;
    return;
  end if;

  -- Anti-leak: valida membership antes de persistir empresa ativa.
  if not exists (
    select 1
    from public.empresa_usuarios eu
    where eu.user_id = v_user_id
      and eu.empresa_id = p_empresa_id
  ) then
    raise exception 'Acesso negado a esta empresa.' using errcode = '42501';
  end if;

  insert into public.user_active_empresa (user_id, empresa_id)
  values (v_user_id, p_empresa_id)
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = now();
end;
$$;

revoke all on function public.set_active_empresa_for_current_user(uuid) from public, anon;
grant execute on function public.set_active_empresa_for_current_user(uuid) to authenticated, service_role;

-- PostgREST schema cache reload (evita PGRST202 após deploy)
select pg_notify('pgrst','reload schema');

commit;

