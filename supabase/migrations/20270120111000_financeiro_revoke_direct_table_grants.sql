/*
  P1.2 (Financeiro RPC-first):
  Remove grants diretos de tabelas `financeiro_%` para `anon` e `authenticated`.
  Acesso deve ocorrer via RPCs SECURITY DEFINER (com RLS/enforcement), evitando 403 intermitentes
  e vazamentos cross-tenant por consultas diretas.
*/

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name LIKE 'financeiro\\_%' ESCAPE '\\'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon, authenticated;', r.table_schema, r.table_name);
  END LOOP;
END;
$$;

