/*
  # [FIX] ensure_request_context — RAISE duplicado de MESSAGE

  Segurança:
  - Mantém SECURITY DEFINER e search_path fixo.
  Compatibilidade:
  - Não altera lógica; apenas remove duplicidade do RAISE.
  Reversível:
  - CREATE OR REPLACE reversível com a versão anterior.
*/

create or replace function public.ensure_request_context()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_emp uuid;
  v_guc text;
begin
  -- Sem usuário (rota pública)? não faz nada.
  if v_uid is null then
    return;
  end if;

  -- Se já veio a GUC do app, respeita
  v_guc := nullif(current_setting('app.current_empresa_id', true), '');
  if v_guc is not null then
    return;
  end if;

  -- Resolve via preferência persistida / vínculo único
  v_emp := public.get_preferred_empresa_for_user(v_uid);

  if v_emp is not null then
    perform set_config('app.current_empresa_id', v_emp::text, false);
    return;
  end if;

  -- Não foi possível determinar tenant
  raise exception 'TENANT_REQUIRED: defina a empresa ativa'
    using errcode = '28000';
end;
$$;
