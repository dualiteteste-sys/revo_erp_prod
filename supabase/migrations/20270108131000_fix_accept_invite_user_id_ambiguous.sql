/*
  Fix: RPC `public.accept_invite_for_current_user(p_empresa_id uuid)` retornando 400 (42702)

  Sintoma observado no app:
  - POST /rest/v1/rpc/accept_invite_for_current_user -> 400
  - message: "column reference \"user_id\" is ambiguous"

  Causa raiz:
  - A função é PL/pgSQL e retorna TABLE(..., user_id, ...). Em PL/pgSQL, colunas com o mesmo nome
    dos OUT params podem virar ambíguas em comandos como INSERT/ON CONFLICT, pois `user_id` também
    existe como variável implícita (OUT param).

  Solução:
  - Aplicar `#variable_conflict use_column` para priorizar colunas nos comandos SQL dentro da função.

  Impacto:
  - Normaliza o fluxo de aceite de convite (PENDING -> ACTIVE) e atualização de empresa ativa.

  Reversibilidade:
  - Reaplicar a definição anterior da função (sem o directive) ou dar DROP FUNCTION.
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
#variable_conflict use_column
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

