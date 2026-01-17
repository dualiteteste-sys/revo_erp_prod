/*
  P1.1: Hardening de grants indevidos
  - A tabela `public.wrappers_fdw_stats` (criada por extensão) vinha com grants amplos
    para `authenticated` sem RLS, o que é desnecessário e aumenta superfície de ataque.
  - Regra: tabelas operacionais devem ser acessadas somente por `service_role` ou via RPC.
*/

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'wrappers_fdw_stats'
      AND c.relkind = 'r'
  ) THEN
    BEGIN
      -- Melhor esforço: restringir grants amplos (tabela de estatísticas da extensão `wrappers`).
      -- Em alguns ambientes o owner pode não ser o mesmo role que aplica migrations; não falhar.
      REVOKE ALL ON TABLE public.wrappers_fdw_stats FROM public, anon, authenticated;
      GRANT ALL ON TABLE public.wrappers_fdw_stats TO service_role;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'wrappers_fdw_stats hardening skipped: % (%)', SQLERRM, SQLSTATE;
    END;
  END IF;
END;
$$;

COMMIT;
