/*
  SEC-01: RLS consistente por empresa_id

  Alvos (detectados via audit local):
  - public.industria_ct_aps_config
  - public.industria_ct_calendario_semana
  - public.pcp_aps_runs
  - public.pcp_aps_run_changes

  Objetivo:
  - Garantir RLS habilitado e policies que restringem por empresa_id do usuário.
*/

BEGIN;

DO $$
DECLARE
  t record;
  v_sql text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM (VALUES
      ('industria_ct_aps_config'),
      ('industria_ct_calendario_semana'),
      ('pcp_aps_runs'),
      ('pcp_aps_run_changes')
    ) AS v(table_name)
    WHERE to_regclass('public.' || v.table_name) IS NOT NULL
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);

    -- Policies idempotentes (DROP + CREATE).
    EXECUTE format('DROP POLICY IF EXISTS sec01_%I_select ON public.%I', t.table_name, t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS sec01_%I_insert ON public.%I', t.table_name, t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS sec01_%I_update ON public.%I', t.table_name, t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS sec01_%I_delete ON public.%I', t.table_name, t.table_name);

    v_sql := format($pol$
      CREATE POLICY sec01_%1$I_select ON public.%1$I
      FOR SELECT
      TO authenticated
      USING (
        empresa_id IN (
          SELECT eu.empresa_id
          FROM public.empresa_usuarios eu
          WHERE eu.user_id = auth.uid()
        )
      );

      CREATE POLICY sec01_%1$I_insert ON public.%1$I
      FOR INSERT
      TO authenticated
      WITH CHECK (
        empresa_id IN (
          SELECT eu.empresa_id
          FROM public.empresa_usuarios eu
          WHERE eu.user_id = auth.uid()
        )
      );

      CREATE POLICY sec01_%1$I_update ON public.%1$I
      FOR UPDATE
      TO authenticated
      USING (
        empresa_id IN (
          SELECT eu.empresa_id
          FROM public.empresa_usuarios eu
          WHERE eu.user_id = auth.uid()
        )
      )
      WITH CHECK (
        empresa_id IN (
          SELECT eu.empresa_id
          FROM public.empresa_usuarios eu
          WHERE eu.user_id = auth.uid()
        )
      );

      CREATE POLICY sec01_%1$I_delete ON public.%1$I
      FOR DELETE
      TO authenticated
      USING (
        empresa_id IN (
          SELECT eu.empresa_id
          FROM public.empresa_usuarios eu
          WHERE eu.user_id = auth.uid()
        )
      );
    $pol$, t.table_name);

    EXECUTE v_sql;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t.table_name);
  END LOOP;
END $$;

COMMIT;

