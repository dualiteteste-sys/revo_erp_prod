/*
  MT (SEV0) — Hardening: prevent tenant leakage via ensure_request_context()

  Why
  - Some environments may still have PostgREST `pgrst.db_pre_request` pointing to `public.ensure_request_context()`.
  - The historical implementation used `set_config(..., false)` which can persist on pooled connections and leak tenant context.

  What
  - Make `ensure_request_context()` a safe alias to `_resolve_tenant_for_request()` (LOCAL + membership validation).
  - Re-assert `pgrst.db_pre_request` for anon/authenticated/service_role to `_resolve_tenant_for_request`.

  Safety
  - No secrets.
  - Fail-closed: `_resolve_tenant_for_request` clears tenant locally at the beginning of each request.
*/

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_request_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  PERFORM public._resolve_tenant_for_request();
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_request_context() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_request_context() TO anon, authenticated, service_role, postgres;

-- Ensure PostgREST runs the resolver at the beginning of every request.
ALTER ROLE authenticated SET "pgrst.db_pre_request" = 'public._resolve_tenant_for_request';
ALTER ROLE anon SET "pgrst.db_pre_request" = 'public._resolve_tenant_for_request';
ALTER ROLE service_role SET "pgrst.db_pre_request" = 'public._resolve_tenant_for_request';

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
