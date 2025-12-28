/*
  Fix: RPCs de parceiros (count/list/details) falhando com 403 por falta de GRANT SELECT.

  `count_partners` / `count_partners_v2` e `get_partner_details` são `security invoker`,
  então o role `authenticated` precisa de SELECT nas tabelas base:
  - public.pessoas
  - public.pessoa_enderecos
  - public.pessoa_contatos
*/

BEGIN;

grant select on table public.pessoas to authenticated, service_role;
grant select on table public.pessoa_enderecos to authenticated, service_role;
grant select on table public.pessoa_contatos to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

COMMIT;

