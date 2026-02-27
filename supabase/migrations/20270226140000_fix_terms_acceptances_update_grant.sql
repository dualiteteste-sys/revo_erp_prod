BEGIN;

-- BUG FIX: terms_accept_current falhava com "permission denied" ao chamar
-- INSERT ... ON CONFLICT DO UPDATE em terms_acceptances.
-- PostgreSQL exige UPDATE privilege para ON CONFLICT DO UPDATE, mesmo que
-- o conflito não ocorra (checagem ocorre em parse/plan time, não em runtime).
-- A migration original concedeu apenas SELECT e INSERT — faltou UPDATE.

GRANT UPDATE ON TABLE public.terms_acceptances TO authenticated, service_role;

COMMIT;
