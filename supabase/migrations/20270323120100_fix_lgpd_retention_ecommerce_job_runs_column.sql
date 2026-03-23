-- Fix: lgpd_run_retention references 'created_at' on ecommerce_job_runs,
-- but that table uses 'started_at' instead.
-- Error: column "created_at" does not exist

CREATE OR REPLACE FUNCTION public.lgpd_run_retention(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_run_id uuid;
  v_started timestamptz := now();
  v_summary jsonb := '{}'::jsonb;
  v_deleted int := 0;
  v_cut_exports interval := interval '30 days';
  v_cut_app_logs interval := interval '90 days';
  v_cut_audit_logs interval := interval '180 days';
  v_cut_ecom interval := interval '180 days';
  v_cut_fiscal interval := interval '365 days';
BEGIN
  INSERT INTO public.lgpd_purge_runs(dry_run, started_at)
  VALUES (coalesce(p_dry_run,false), v_started)
  RETURNING id INTO v_run_id;

  -- LGPD exports (rows + objetos)
  IF to_regclass('public.lgpd_exports') IS NOT NULL THEN
    WITH targets AS (
      SELECT id, file_path
      FROM public.lgpd_exports
      WHERE created_at < now() - v_cut_exports
        AND file_path IS NOT NULL
    )
    SELECT count(*) INTO v_deleted FROM targets;
    v_summary := v_summary || jsonb_build_object('lgpd_exports_candidates', v_deleted);

    IF NOT coalesce(p_dry_run,false) AND v_deleted > 0 THEN
      IF to_regclass('storage.objects') IS NOT NULL THEN
        DELETE FROM storage.objects o
        USING (
          SELECT id, file_path
          FROM public.lgpd_exports
          WHERE created_at < now() - v_cut_exports
            AND file_path IS NOT NULL
        ) t
        WHERE o.bucket_id = 'lgpd_exports'
          AND o.name = t.file_path;
      END IF;

      DELETE FROM public.lgpd_exports
      WHERE created_at < now() - v_cut_exports
        AND file_path IS NOT NULL;
    END IF;
  END IF;

  -- app_logs (OPS)
  IF to_regclass('public.app_logs') IS NOT NULL THEN
    SELECT count(*) INTO v_deleted
    FROM public.app_logs
    WHERE created_at < now() - v_cut_app_logs;
    v_summary := v_summary || jsonb_build_object('app_logs_candidates', v_deleted);

    IF NOT coalesce(p_dry_run,false) AND v_deleted > 0 THEN
      DELETE FROM public.app_logs
      WHERE created_at < now() - v_cut_app_logs;
    END IF;
  END IF;

  -- audit_logs (DB)
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    SELECT count(*) INTO v_deleted
    FROM public.audit_logs
    WHERE changed_at < now() - v_cut_audit_logs;
    v_summary := v_summary || jsonb_build_object('audit_logs_candidates', v_deleted);

    IF NOT coalesce(p_dry_run,false) AND v_deleted > 0 THEN
      DELETE FROM public.audit_logs
      WHERE changed_at < now() - v_cut_audit_logs;
    END IF;
  END IF;

  -- E-commerce operational tables
  IF to_regclass('public.ecommerce_logs') IS NOT NULL THEN
    SELECT count(*) INTO v_deleted
    FROM public.ecommerce_logs
    WHERE created_at < now() - v_cut_ecom;
    v_summary := v_summary || jsonb_build_object('ecommerce_logs_candidates', v_deleted);
    IF NOT coalesce(p_dry_run,false) AND v_deleted > 0 THEN
      DELETE FROM public.ecommerce_logs
      WHERE created_at < now() - v_cut_ecom;
    END IF;
  END IF;

  IF to_regclass('public.ecommerce_job_runs') IS NOT NULL THEN
    SELECT count(*) INTO v_deleted
    FROM public.ecommerce_job_runs
    WHERE started_at < now() - v_cut_ecom;  -- Fixed: was 'created_at', column is 'started_at'
    v_summary := v_summary || jsonb_build_object('ecommerce_job_runs_candidates', v_deleted);
    IF NOT coalesce(p_dry_run,false) AND v_deleted > 0 THEN
      DELETE FROM public.ecommerce_job_runs
      WHERE started_at < now() - v_cut_ecom;  -- Fixed: was 'created_at'
    END IF;
  END IF;

  IF to_regclass('public.ecommerce_job_dead_letters') IS NOT NULL THEN
    SELECT count(*) INTO v_deleted
    FROM public.ecommerce_job_dead_letters
    WHERE created_at < now() - v_cut_ecom;
    v_summary := v_summary || jsonb_build_object('ecommerce_dead_letters_candidates', v_deleted);
    IF NOT coalesce(p_dry_run,false) AND v_deleted > 0 THEN
      DELETE FROM public.ecommerce_job_dead_letters
      WHERE created_at < now() - v_cut_ecom;
    END IF;
  END IF;

  -- Fiscal provider logs/events
  IF to_regclass('public.fiscal_nfe_provider_logs') IS NOT NULL THEN
    SELECT count(*) INTO v_deleted
    FROM public.fiscal_nfe_provider_logs
    WHERE created_at < now() - v_cut_fiscal;
    v_summary := v_summary || jsonb_build_object('fiscal_nfe_provider_logs_candidates', v_deleted);
    IF NOT coalesce(p_dry_run,false) AND v_deleted > 0 THEN
      DELETE FROM public.fiscal_nfe_provider_logs
      WHERE created_at < now() - v_cut_fiscal;
    END IF;
  END IF;

  IF to_regclass('public.fiscal_nfe_provider_events') IS NOT NULL THEN
    SELECT count(*) INTO v_deleted
    FROM public.fiscal_nfe_provider_events
    WHERE created_at < now() - v_cut_fiscal;
    v_summary := v_summary || jsonb_build_object('fiscal_nfe_provider_events_candidates', v_deleted);
    IF NOT coalesce(p_dry_run,false) AND v_deleted > 0 THEN
      DELETE FROM public.fiscal_nfe_provider_events
      WHERE created_at < now() - v_cut_fiscal;
    END IF;
  END IF;

  UPDATE public.lgpd_purge_runs
  SET finished_at = now(),
      summary = v_summary
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', coalesce(p_dry_run,false),
    'run_id', v_run_id,
    'summary', v_summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lgpd_run_retention(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lgpd_run_retention(boolean) TO service_role;
