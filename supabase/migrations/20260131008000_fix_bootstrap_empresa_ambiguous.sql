/*
  Fix: bootstrap_empresa_for_current_user "empresa_id is ambiguous"

  Causa:
  - A função retorna TABLE(empresa_id, status), então `empresa_id` vira uma variável OUT do PL/pgSQL.
  - Dentro do corpo, usamos SQL com colunas chamadas `empresa_id` (INSERT/ON CONFLICT etc.).
  - Em algumas versões/configs, isso pode gerar: column reference "empresa_id" is ambiguous.

  Solução:
  - `#variable_conflict use_column` para priorizar colunas em SQL dentro da função
  - Ajuste leve no upsert para evitar qualificação desnecessária.
*/

BEGIN;

create or replace function public.bootstrap_empresa_for_current_user(
  p_razao_social text default null,
  p_fantasia text default null
)
returns table (empresa_id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.current_user_id();
  v_emp uuid;
  v_owner_role_id uuid;
begin
  if v_uid is null then
    raise exception '[RPC][BOOTSTRAP_EMPRESA] Usuário não autenticado.' using errcode = '42501';
  end if;

  -- 1) Já existe empresa ativa
  select uae.empresa_id into v_emp
  from public.user_active_empresa uae
  where uae.user_id = v_uid;

  if v_emp is not null then
    return query select v_emp, 'already_active';
    return;
  end if;

  -- 2) Tem vínculo: ativa a mais recente
  select eu.empresa_id into v_emp
  from public.empresa_usuarios eu
  where eu.user_id = v_uid
  order by eu.created_at desc
  limit 1;

  if v_emp is not null then
    perform public.set_active_empresa_for_current_user(v_emp);
    return query select v_emp, 'activated_existing';
    return;
  end if;

  -- 3) Não tem vínculo: cria empresa + vínculo owner + ativa
  insert into public.empresas (nome, owner_id)
  values (coalesce(nullif(p_razao_social,''), nullif(p_fantasia,''), 'Empresa sem Nome'), v_uid)
  returning id into v_emp;

  select id into v_owner_role_id from public.roles where slug = 'OWNER';

  insert into public.empresa_usuarios (empresa_id, user_id, role, role_id)
  values (v_emp, v_uid, 'owner', v_owner_role_id)
  on conflict (empresa_id, user_id) do update set
    role = excluded.role,
    role_id = coalesce(excluded.role_id, empresa_usuarios.role_id);

  perform public.set_active_empresa_for_current_user(v_emp);
  return query select v_emp, 'created_new';
end;
$$;

revoke all on function public.bootstrap_empresa_for_current_user(text, text) from public, anon;
grant execute on function public.bootstrap_empresa_for_current_user(text, text) to authenticated, service_role, postgres;

create or replace function public.secure_bootstrap_empresa_for_current_user(
  p_razao_social text default null,
  p_fantasia text default null
)
returns table (empresa_id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
    select * from public.bootstrap_empresa_for_current_user(p_razao_social, p_fantasia);
end;
$$;

revoke all on function public.secure_bootstrap_empresa_for_current_user(text, text) from public, anon;
grant execute on function public.secure_bootstrap_empresa_for_current_user(text, text) to authenticated, service_role, postgres;

select pg_notify('pgrst','reload schema');

COMMIT;

