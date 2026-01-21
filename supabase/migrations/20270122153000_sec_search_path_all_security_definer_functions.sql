/*
  SEC/P1.3 — Hardening de SECURITY DEFINER (search_path)

  Objetivo:
  - Garantir que TODA função SECURITY DEFINER no schema `public` tenha `search_path`
    fixo e seguro (`pg_catalog, public`).
  - Evita a classe de vulnerabilidade por "search_path mutable".

  Observação:
  - Não altera lógica das funções; apenas configura `proconfig`.
  - Seguro para rodar repetidamente (ALTER idempotente).
*/

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args,
      p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef IS TRUE
  LOOP
    -- Sempre fixa para pg_catalog, public (mesmo se já estiver fixo).
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path TO pg_catalog, public',
      r.nspname,
      r.proname,
      r.args
    );
  END LOOP;
END $$;

-- Recarregar cache do PostgREST (RPCs/views).
select pg_notify('pgrst', 'reload schema');

COMMIT;

