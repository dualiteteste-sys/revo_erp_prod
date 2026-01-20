/*
  P1.1 (RLS): Completar inventário "MÉDIO"
  - Algumas tabelas multi-tenant (com empresa_id) tinham RLS habilitado, mas sem policy que
    referencie current_empresa_id(), o que polui o inventário e deixa brechas futuras
    (ex.: se algum grant voltar por engano).
  - Para tabelas internas que NÃO devem ser acessadas diretamente pelo client, mantemos
    a postura "deny", porém garantindo que a policy tenha a base em current_empresa_id().

  P1.1 (RLS/RG01): wrappers_fdw_stats
  - A tabela `public.wrappers_fdw_stats` (criada por extensão) pode reaparecer/ser recriada
    com grants amplos. Criamos um event trigger idempotente para re-hardenizar os grants.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Policies "deny" baseadas em current_empresa_id() para evitar acesso direto mesmo
-- que grants apareçam (e para satisfazer o inventário de RLS).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  pol_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.ecommerce_connection_secrets',
    'public.financeiro_recorrencias_ocorrencias',
    'public.idempotency_keys',
    'public.integration_circuit_breakers',
    'public.integration_rate_limit_counters',
    'public.recebimento_materiais_cliente_links',
    'public.vendas_automacao_jobs'
  ]
  LOOP
    IF to_regclass(t) IS NULL THEN
      CONTINUE;
    END IF;

    pol_name := replace(t, 'public.', 'sec_p1_') || '_deny_authenticated_current_empresa';

    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol_name, t);

    EXECUTE format($sql$
      CREATE POLICY %I
      ON %s
      FOR ALL
      TO authenticated
      USING (empresa_id = public.current_empresa_id() AND false)
      WITH CHECK (empresa_id = public.current_empresa_id() AND false)
    $sql$, pol_name, t);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- wrappers_fdw_stats: hardening contínuo (event trigger) para evitar regressões.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ops__harden_wrappers_fdw_stats_grants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF to_regclass('public.wrappers_fdw_stats') IS NULL THEN
    RETURN;
  END IF;

  REVOKE ALL ON TABLE public.wrappers_fdw_stats FROM public;
  REVOKE ALL ON TABLE public.wrappers_fdw_stats FROM anon;
  REVOKE ALL ON TABLE public.wrappers_fdw_stats FROM authenticated;

  GRANT ALL ON TABLE public.wrappers_fdw_stats TO service_role;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN insufficient_privilege THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ops__harden_wrappers_fdw_stats_grants() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops__harden_wrappers_fdw_stats_grants() TO service_role;

CREATE OR REPLACE FUNCTION public.ops__evtrg_harden_wrappers_fdw_stats()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.ops__harden_wrappers_fdw_stats_grants();
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

DROP EVENT TRIGGER IF EXISTS ev_ops_harden_wrappers_fdw_stats;
CREATE EVENT TRIGGER ev_ops_harden_wrappers_fdw_stats
ON ddl_command_end
EXECUTE FUNCTION public.ops__evtrg_harden_wrappers_fdw_stats();

SELECT pg_notify('pgrst','reload schema');

COMMIT;
