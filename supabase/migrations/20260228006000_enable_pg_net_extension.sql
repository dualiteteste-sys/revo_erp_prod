/*
  Fix: DEV missing EXTENSION|pg_net (detected by Verify Migrations workflow).

  Supabase local starts with pg_net enabled by default, but remote projects may not.
  Keeping it explicit in migrations avoids drift between VERIFY/DEV/PROD.
*/

BEGIN;

create extension if not exists pg_net;

select pg_notify('pgrst', 'reload schema');

COMMIT;

