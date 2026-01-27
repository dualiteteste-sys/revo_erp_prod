/*
  MT (P0) — Fix definitive tenant resolution (no leakage across pooled connections)

  Root cause
  - _resolve_tenant_for_request() was calling set_config('app.current_empresa_id', ..., false)
    which can persist on pooled connections, contaminating subsequent requests.
  - It also trusted x-empresa-id without validating membership.

  Goals
  - Ensure tenant context is always transaction-local (set_config(..., true)).
  - Ensure header tenant is accepted only when user is member of that empresa.
  - Ensure we always clear any previous local value at the start of each request.
  - Keep safe fallback (preferred empresa), without raising hard errors for public routes.
*/

BEGIN;

CREATE OR REPLACE FUNCTION public._resolve_tenant_for_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_uid uuid := public.current_user_id();
  v_emp uuid;
  v_headers json;
  v_header_val text;
  v_header_emp uuid;
BEGIN
  -- Public routes (not authenticated): do nothing.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Always start clean for THIS request/transaction.
  -- IMPORTANT: use "LOCAL" (3rd arg true) to avoid leaking across pooled connections.
  PERFORM set_config('app.current_empresa_id', '', true);

  -- 1) Try HTTP header tenant (x-empresa-id) when present and valid.
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_header_val := v_headers ->> 'x-empresa-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_val := NULL;
  END;

  IF v_header_val IS NOT NULL THEN
    BEGIN
      v_header_emp := v_header_val::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_header_emp := NULL;
    END;

    IF v_header_emp IS NOT NULL AND public.is_user_member_of(v_header_emp) THEN
      PERFORM set_config('app.current_empresa_id', v_header_emp::text, true);
      RETURN;
    END IF;
  END IF;

  -- 2) Fallback: preferred empresa for user (already validates membership).
  v_emp := public.get_preferred_empresa_for_user(v_uid);
  IF v_emp IS NOT NULL THEN
    PERFORM set_config('app.current_empresa_id', v_emp::text, true);
    RETURN;
  END IF;

  -- 3) No tenant: do not raise here.
  -- Tenant-specific RLS will block as needed; public pages should remain accessible.
  RETURN;
END;
$$;

-- Ensure PostgREST runs the resolver at the beginning of every request.
-- (kept idempotent; this is safe to repeat)
ALTER ROLE authenticated SET "pgrst.db_pre_request" = 'public._resolve_tenant_for_request';
ALTER ROLE anon SET "pgrst.db_pre_request" = 'public._resolve_tenant_for_request';
ALTER ROLE service_role SET "pgrst.db_pre_request" = 'public._resolve_tenant_for_request';

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

