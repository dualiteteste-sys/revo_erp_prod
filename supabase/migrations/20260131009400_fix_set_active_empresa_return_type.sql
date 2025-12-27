/*
  Fix: DEV remoto com função antiga (return type diferente)

  Problema:
  - Em alguns ambientes (DEV antigo), já existe `public.set_active_empresa_for_current_user(uuid)`
    com um return type diferente do que definimos nas migrations atuais.
  - `CREATE OR REPLACE FUNCTION` NÃO permite alterar return type → erro SQLSTATE 42P13.

  Solução:
  - Dropar explicitamente a função (apenas pela assinatura de args) e recriar no formato atual.
  - Em banco limpo, o DROP é no-op e a migration continua idempotente.
*/

BEGIN;

drop function if exists public.set_active_empresa_for_current_user(uuid);

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

  if not public.is_user_member_of(p_empresa_id) then
    raise exception 'Acesso negado a esta empresa.' using errcode = '42501';
  end if;

  insert into public.user_active_empresa (user_id, empresa_id)
  values (v_user_id, p_empresa_id)
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = now();
end;
$$;

grant execute on function public.set_active_empresa_for_current_user(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

