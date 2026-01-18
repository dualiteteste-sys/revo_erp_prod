/*
  P1.1 (RLS/RG01): Extensão / wrappers_fdw_stats
  - `wrappers_fdw_stats` não é dado de tenant, mas pode vir com grants amplos por padrão.
  - Para reduzir ruído e evitar superfície desnecessária, removemos grants de `authenticated/anon/public`.
*/

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.wrappers_fdw_stats') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.wrappers_fdw_stats FROM authenticated;
    REVOKE ALL ON TABLE public.wrappers_fdw_stats FROM anon;
    REVOKE ALL ON TABLE public.wrappers_fdw_stats FROM public;
  END IF;
END;
$$;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

