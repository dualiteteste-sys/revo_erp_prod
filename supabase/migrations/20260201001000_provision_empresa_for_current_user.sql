/*
  RPC compat: provision_empresa_for_current_user

  O frontend antigo ainda usa essa RPC durante onboarding/criação de empresa.
  A base atual usa `secure_bootstrap_empresa_for_current_user` e a tabela `empresas`
  com campos `nome_razao_social`/`nome_fantasia` (não `razao_social`/`fantasia`).
*/

BEGIN;

create or replace function public.provision_empresa_for_current_user(
  p_razao_social text,
  p_fantasia     text,
  p_email        text default null
)
returns public.empresas
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_emp public.empresas;
  v_nome_razao text := coalesce(nullif(p_razao_social,''), nullif(p_fantasia,''), 'Empresa sem Nome');
  v_nome_fantasia text := nullif(p_fantasia,'');
  v_email text := nullif(p_email,'');
  v_owner_role_id uuid;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  insert into public.empresas (nome, owner_id, nome_razao_social, nome_fantasia, email)
  values (v_nome_razao, v_user_id, v_nome_razao, v_nome_fantasia, v_email)
  returning * into v_emp;

  select id into v_owner_role_id from public.roles where slug = 'OWNER' limit 1;

  insert into public.empresa_usuarios (empresa_id, user_id, role, role_id, status, is_principal)
  values (v_emp.id, v_user_id, 'owner', v_owner_role_id, 'ACTIVE', true)
  on conflict (empresa_id, user_id) do update set
    role = excluded.role,
    role_id = coalesce(excluded.role_id, public.empresa_usuarios.role_id),
    status = 'ACTIVE',
    is_principal = true,
    updated_at = now();

  insert into public.user_active_empresa (user_id, empresa_id, updated_at)
  values (v_user_id, v_emp.id, now())
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = excluded.updated_at;

  return v_emp;
end;
$$;

revoke all on function public.provision_empresa_for_current_user(text, text, text) from public;
grant execute on function public.provision_empresa_for_current_user(text, text, text) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

