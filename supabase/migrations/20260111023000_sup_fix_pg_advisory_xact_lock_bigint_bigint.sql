-- Fix: some functions call pg_advisory_xact_lock(bigint, bigint) which does not exist in pg_catalog.
-- We provide a safe wrapper in public schema so it resolves via search_path (pg_catalog, public).

create or replace function public.pg_advisory_xact_lock(key1 bigint, key2 bigint)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended(key1::text || ':' || key2::text, 0));
end;
$$;

revoke all on function public.pg_advisory_xact_lock(bigint, bigint) from public, anon, authenticated;
grant execute on function public.pg_advisory_xact_lock(bigint, bigint) to service_role;

