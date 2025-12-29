/*
  Alinhamento DEV/PROD (anti-drift)

  O workflow "Compare DEV vs PROD schema" detectou:
  - PROD tem extensões `pg_trgm` e `wrappers` e DEV não.
  - DEV tem bucket `db-backups` e PROD não.

  Este migration torna isso idempotente e consistente entre ambientes.
*/

BEGIN;

create extension if not exists pg_trgm;
create extension if not exists wrappers;

insert into storage.buckets (id, name, public)
values ('db-backups', 'db-backups', false)
on conflict (id) do nothing;

select pg_notify('pgrst', 'reload schema');

COMMIT;

