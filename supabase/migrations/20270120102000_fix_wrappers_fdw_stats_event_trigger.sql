/*
  Fix: ev_ops_harden_wrappers_fdw_stats estava sendo executado em TODO DDL (ddl_command_end),
  causando spam de WARNING/REVOKE e eventualmente statement_timeout durante `supabase db push`.

  Objetivo: executar hardening apenas quando o objeto `public.wrappers_fdw_stats` for afetado.
*/

BEGIN;

-- Desliga temporariamente para evitar que o trigger “se auto-dispare” repetidamente durante migrações.
ALTER EVENT TRIGGER ev_ops_harden_wrappers_fdw_stats DISABLE;

CREATE OR REPLACE FUNCTION public.ops__evtrg_harden_wrappers_fdw_stats()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  should_run boolean := false;
BEGIN
  -- Rodar apenas quando o DDL afetar explicitamente o objeto.
  SELECT EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() c
    WHERE
      c.object_identity = 'public.wrappers_fdw_stats'
      OR (c.schema_name = 'public' AND c.object_name = 'wrappers_fdw_stats')
  )
  INTO should_run;

  IF should_run THEN
    PERFORM public.ops__harden_wrappers_fdw_stats_grants();
  END IF;
END;
$$;

ALTER EVENT TRIGGER ev_ops_harden_wrappers_fdw_stats ENABLE;

COMMIT;

