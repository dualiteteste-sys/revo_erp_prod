/*
  # [NORMALIZE] bootstraps legados -> caminho único (secure_bootstrap_empresa_for_current_user)

  Segurança:
  - SECURITY DEFINER + search_path = pg_catalog, public.
  - Reuso da RPC segura idempotente.
  - RLS preservada (inserções sob definer; leituras sob políticas vigentes).

  Compatibilidade:
  - Mantém assinaturas/retornos (uuid).
  - Unifica comportamento ("Empresa sem Nome" como padrão).

  Reversibilidade:
  - CREATE OR REPLACE reversível; comentários deprecam sem quebrar chamadas existentes.

  Performance:
  - Sem impacto relevante.
*/

-- 1) Versão sem parâmetros: delega à RPC segura e retorna empresa ativa/preferida
create or replace function public.bootstrap_empresa_for_current_user()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_emp uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Cria/garante membership + active (idempotente)
  perform public.secure_bootstrap_empresa_for_current_user('Empresa sem Nome', null);

  -- Retorna empresa ativa/preferida
  v_emp := public.get_preferred_empresa_for_user(v_uid);
  return v_emp;
end;
$$;

comment on function public.bootstrap_empresa_for_current_user()
  is '[DEPRECATED SHIM] Delegates to secure_bootstrap_empresa_for_current_user and returns active empresa.';

revoke all on function public.bootstrap_empresa_for_current_user() from public;
grant execute on function public.bootstrap_empresa_for_current_user() to authenticated, service_role;


-- 2) Versão com payload jsonb: extrai campos, delega à RPC segura e retorna empresa ativa
create or replace function public.bootstrap_empresa_for_current_user(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid   uuid := public.current_user_id();
  v_emp   uuid;
  v_razao text := coalesce(nullif(payload->>'razao_social',''), 'Empresa sem Nome');
  v_fant  text := nullif(payload->>'fantasia','');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform public.secure_bootstrap_empresa_for_current_user(v_razao, v_fant);

  v_emp := public.get_preferred_empresa_for_user(v_uid);
  return v_emp;
end;
$$;

comment on function public.bootstrap_empresa_for_current_user(jsonb)
  is '[DEPRECATED SHIM] Delegates to secure_bootstrap_empresa_for_current_user(payload) and returns active empresa.';

revoke all on function public.bootstrap_empresa_for_current_user(jsonb) from public;
grant execute on function public.bootstrap_empresa_for_current_user(jsonb) to authenticated, service_role;
