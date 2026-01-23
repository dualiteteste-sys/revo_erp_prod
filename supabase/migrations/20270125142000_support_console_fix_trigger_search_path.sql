-- Fix: RG-03 SEC-02b requires all SECURITY DEFINER functions in public to have fixed search_path.
-- Trigger functions are also SECURITY DEFINER.

ALTER FUNCTION public.support_tickets_touch() SET search_path = pg_catalog, public;

SELECT pg_notify('pgrst', 'reload schema');
