-- Fix: RG-03 SEC-02b requires all SECURITY DEFINER functions in public to have fixed search_path.

ALTER FUNCTION public.ops_is_staff_for_current_user() SET search_path = pg_catalog, public;

ALTER FUNCTION public.support_ticket_create(text, text, jsonb, text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.support_ticket_reply(uuid, text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.support_tickets_list_for_current_user(text, integer, integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.support_ticket_get(uuid) SET search_path = pg_catalog, public;

ALTER FUNCTION public.support_staff_tickets_list(text, text, uuid, integer, integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.support_staff_ticket_set_status(uuid, text) SET search_path = pg_catalog, public;

SELECT pg_notify('pgrst', 'reload schema');
