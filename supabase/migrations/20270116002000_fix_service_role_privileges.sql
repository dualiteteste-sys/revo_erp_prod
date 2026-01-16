/*
  Fix: service_role permissions on schema public

  Symptoms in Edge Functions (dev/prod):
    - code 42501: "permission denied for schema public"
    - billing-checkout can't read/write public.plans / public.empresas

  Goal:
    - Ensure the `service_role` used by Edge Functions has USAGE on schema public
      and full access to tables/sequences/functions in public.

  Idempotent: safe to run multiple times.
*/

do $$
begin
  -- Schema usage
  execute 'grant usage on schema public to service_role';

  -- Tables / sequences / functions in public
  execute 'grant all privileges on all tables in schema public to service_role';
  execute 'grant all privileges on all sequences in schema public to service_role';
  execute 'grant all privileges on all functions in schema public to service_role';

  -- Future objects defaults
  execute 'alter default privileges in schema public grant all on tables to service_role';
  execute 'alter default privileges in schema public grant all on sequences to service_role';
  execute 'alter default privileges in schema public grant all on functions to service_role';
exception
  when insufficient_privilege then
    -- In local verify/migrations this should not happen, but keep it safe.
    raise notice 'Skipping service_role grants due to insufficient_privilege.';
end $$;

select pg_notify('pgrst','reload schema');

