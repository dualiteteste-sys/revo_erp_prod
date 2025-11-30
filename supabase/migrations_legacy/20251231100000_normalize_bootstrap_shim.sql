/*
  # [NORMALIZE] bootstrap_empresa_for_current_user(text, text) -> delega ao caminho único

  Segurança:
  - SECURITY DEFINER + search_path = pg_catalog, public.
  - Reusa a RPC idempotente secure_bootstrap_empresa_for_current_user.

  Compatibilidade:
  - Mantém assinatura/retorno (uuid), comportamento unificado com overloads já ajustados.

  Reversibilidade:
  - CREATE OR REPLACE.

  Performance:
  - Irrelevante (chamada leve).
*/

create or replace function public.bootstrap_empresa_for_current_user(
  p_razao_social text,
  p_fantasia     text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_emp uuid;
  v_razao text := coalesce(nullif(p_razao_social,''), 'Empresa sem Nome');
  v_fant  text := nullif(p_fantasia,'');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Cria/garante membership + empresa ativa (idempotente)
  perform public.secure_bootstrap_empresa_for_current_user(v_razao, v_fant);

  -- Retorna empresa ativa/preferida
  v_emp := public.get_preferred_empresa_for_user(v_uid);
  return v_emp;
end;
$$;

comment on function public.bootstrap_empresa_for_current_user(text, text)
  is '[DEPRECATED SHIM] Delegates to secure_bootstrap_empresa_for_current_user(args) and returns active empresa.';

revoke all on function public.bootstrap_empresa_for_current_user(text, text) from public;
grant execute on function public.bootstrap_empresa_for_current_user(text, text) to authenticated, service_role;
