/*
  Infra: ensure_request_context() para PostgREST (db-pre-request)

  Problema em PROD:
  - Após reset, algumas instâncias estavam configuradas para executar
    `public.ensure_request_context()` antes de cada request (PostgREST pre-request).
  - Se a função não existir, o app falha logo no fluxo de confirmação/login.

  Comportamento desejado:
  - Requests públicos (anon/landing): não fazem nada.
  - Requests autenticados: se não houver `app.current_empresa_id`, tenta resolver via
    preferência persistida (user_active_empresa) ou vínculo único (empresa_usuarios)
    e seta a GUC para o resto do request.
  - Nunca levantar erro (safe-by-default: RLS continua bloqueando quando não há empresa ativa).
*/

BEGIN;

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
  -- 1) Requisição anônima (landing, pricing, etc.)? Não seta nada e segue.
  if v_uid is null then
    return;
  end if;

  -- 2) Se já veio a GUC (empresa ativa) externamente, respeita.
  v_guc := nullif(current_setting('app.current_empresa_id', true), '');
  if v_guc is not null then
    return;
  end if;

  -- 3) Resolve preferência persistida / vínculo único
  v_emp := public.get_preferred_empresa_for_user(v_uid);

  -- 4) Se conseguir resolver, seta; senão, apenas retorna (sem exception).
  if v_emp is not null then
    perform set_config('app.current_empresa_id', v_emp::text, false);
  end if;

  return;
end;
$$;

revoke all on function public.ensure_request_context() from public;
grant execute on function public.ensure_request_context() to anon, authenticated, service_role, postgres;

select pg_notify('pgrst','reload schema');

COMMIT;

