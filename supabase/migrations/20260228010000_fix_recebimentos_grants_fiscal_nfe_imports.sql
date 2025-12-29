/*
  Fix: 403 (permission denied) ao acessar recebimentos com join em fiscal_nfe_imports

  PostgREST precisa de GRANT SELECT na tabela relacionada para resolver o embed:
  /recebimentos?select=*,fiscal_nfe_imports(...)
*/

BEGIN;

grant select on table public.fiscal_nfe_imports to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

COMMIT;

