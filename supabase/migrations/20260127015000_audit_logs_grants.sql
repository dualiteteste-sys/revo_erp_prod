-- Allow authenticated users to read audit logs (RLS still applies).
BEGIN;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

-- For server-side/admin usage (safe even if already granted by Supabase defaults).
GRANT SELECT ON TABLE public.audit_logs TO service_role;

COMMIT;

