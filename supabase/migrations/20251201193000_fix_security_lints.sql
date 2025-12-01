-- Migration: Fix Security Lints (2025-12-01)
-- Description: Resolves 'security_definer_view' and 'function_search_path_mutable' lints.

-- 1. Fix 'security_definer_view' on public.empresa_features
-- We recreate the view with 'security_invoker = true' to ensure that Row Level Security (RLS)
-- policies are enforced based on the user invoking the view, not the view owner.
-- We also add 'security_barrier = true' to prevent query planner optimizations from leaking data.

CREATE OR REPLACE VIEW "public"."empresa_features"
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    e.id AS empresa_id,
    (EXISTS (
        SELECT 1
        FROM public.empresa_addons ea
        WHERE ea.empresa_id = e.id
          AND ea.addon_slug = 'REVO_SEND'::text
          AND (ea.status = ANY (ARRAY['active'::text, 'trialing'::text]))
          AND (COALESCE(ea.cancel_at_period_end, false) = false)
    )) AS revo_send_enabled
FROM public.empresas e
WHERE (EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = e.id
      AND eu.user_id = public.current_user_id()
));

-- 2. Fix 'function_search_path_mutable' on public._create_idx_safe
-- We set a fixed 'search_path' to prevent malicious objects from being executed
-- if the function is called with a compromised search path.

CREATE OR REPLACE PROCEDURE public._create_idx_safe(IN p_sql text)
LANGUAGE plpgsql
SET search_path = 'pg_catalog', 'public'
AS $procedure$
    begin
      begin
        execute p_sql;
      exception
        when lock_not_available then
          raise notice '[IDX][SKIP-LOCK] %', p_sql;
        when duplicate_table or duplicate_object then
          null;
      end;
    end;
$procedure$;
