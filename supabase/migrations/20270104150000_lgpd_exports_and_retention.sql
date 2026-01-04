/*
  LGPD-02 / LGPD-03

  Motivo:
  - LGPD-02: permitir que o titular exporte seus dados (self-export) com trilha/auditoria.
  - LGPD-03: definir retenção/expurgo seguro para logs e artefatos operacionais, reduzindo risco e custo.

  Impacto:
  - Cria bucket privado `lgpd_exports` (se storage existir) e políticas restritivas.
  - Cria tabelas `public.lgpd_exports` e `public.lgpd_purge_runs` com RLS.
  - Cria RPC `public.lgpd_run_retention(p_dry_run boolean)` (uso por jobs/service_role).

  Reversibilidade:
  - Reverter removendo as tabelas/função e, opcionalmente, o bucket/policies.
  - Atenção: expurgos são destrutivos por natureza (hard delete). Use `p_dry_run=true` para simular.
*/

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- LGPD-02: Bucket privado para exports
-- Path: <empresa_id>/lgpd/<user_id>/<export_id>.json
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('lgpd_exports', 'lgpd_exports', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "LGPD Exports Read (self)" ON storage.objects;
  CREATE POLICY "LGPD Exports Read (self)"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'lgpd_exports'
      AND split_part(name, '/', 1) = public.current_empresa_id()::text
      AND split_part(name, '/', 3) = auth.uid()::text
    );

  -- Writes by server (edge functions) only.
  DROP POLICY IF EXISTS "LGPD Exports Insert (service)" ON storage.objects;
  CREATE POLICY "LGPD Exports Insert (service)"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'lgpd_exports'
      AND auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "LGPD Exports Update (service)" ON storage.objects;
  CREATE POLICY "LGPD Exports Update (service)"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'lgpd_exports'
      AND auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "LGPD Exports Delete (service)" ON storage.objects;
  CREATE POLICY "LGPD Exports Delete (service)"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'lgpd_exports'
      AND auth.role() = 'service_role'
    );
END$$;

-- -----------------------------------------------------------------------------
-- LGPD-02: tabela de trilha do export
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lgpd_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL DEFAULT auth.uid(),
  subject_type text NOT NULL DEFAULT 'user' CHECK (subject_type IN ('user', 'pessoa')),
  subject_id uuid NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'error')),
  file_path text NULL,
  format text NOT NULL DEFAULT 'json',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_lgpd_exports_empresa_created_at ON public.lgpd_exports(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lgpd_exports_empresa_requester_created_at ON public.lgpd_exports(empresa_id, requester_id, created_at DESC);

ALTER TABLE public.lgpd_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lgpd_exports_select_self ON public.lgpd_exports;
CREATE POLICY lgpd_exports_select_self
  ON public.lgpd_exports
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND requester_id = auth.uid()
  );

-- Somente server/job escreve; usuário final não insere/edita/apaga
DROP POLICY IF EXISTS lgpd_exports_insert_deny ON public.lgpd_exports;
CREATE POLICY lgpd_exports_insert_deny
  ON public.lgpd_exports
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS lgpd_exports_update_deny ON public.lgpd_exports;
CREATE POLICY lgpd_exports_update_deny
  ON public.lgpd_exports
  FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS lgpd_exports_delete_deny ON public.lgpd_exports;
CREATE POLICY lgpd_exports_delete_deny
  ON public.lgpd_exports
  FOR DELETE
  TO authenticated
  USING (false);

-- -----------------------------------------------------------------------------
-- LGPD-03: trilha do expurgo/retention (execução segura)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lgpd_purge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dry_run boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid NULL DEFAULT auth.uid(),
  actor_role text NULL DEFAULT auth.role()
);

CREATE INDEX IF NOT EXISTS idx_lgpd_purge_runs_started_at ON public.lgpd_purge_runs(started_at DESC);

ALTER TABLE public.lgpd_purge_runs ENABLE ROW LEVEL SECURITY;

-- Apenas perfis com permissão de OPS podem visualizar trilha de expurgo.
DO $$
BEGIN
  IF to_regprocedure('public.has_permission_for_current_user(text, text)') IS NULL THEN
    -- Se RBAC ainda não existe (ex.: ambiente limpo), não travar a migration.
    RETURN;
  END IF;

  DROP POLICY IF EXISTS lgpd_purge_runs_select_ops ON public.lgpd_purge_runs;
  EXECUTE $pol$
    CREATE POLICY lgpd_purge_runs_select_ops
      ON public.lgpd_purge_runs
      FOR SELECT
      TO authenticated
      USING (public.has_permission_for_current_user('ops','view'))
  $pol$;
END$$;

DROP POLICY IF EXISTS lgpd_purge_runs_insert_deny ON public.lgpd_purge_runs;
CREATE POLICY lgpd_purge_runs_insert_deny
  ON public.lgpd_purge_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS lgpd_purge_runs_update_deny ON public.lgpd_purge_runs;
CREATE POLICY lgpd_purge_runs_update_deny
  ON public.lgpd_purge_runs
  FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS lgpd_purge_runs_delete_deny ON public.lgpd_purge_runs;
CREATE POLICY lgpd_purge_runs_delete_deny
  ON public.lgpd_purge_runs
  FOR DELETE
  TO authenticated
  USING (false);

-- -----------------------------------------------------------------------------
-- LGPD-03: Função de retenção/expurgo (server/job)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.lgpd_run_retention(boolean);
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
  -- Cria run
  INSERT INTO public.lgpd_purge_runs(dry_run, started_at)
  VALUES (coalesce(p_dry_run,false), v_started)
  RETURNING id INTO v_run_id;

  -- -----------------------------
  -- LGPD exports (rows + objetos)
  -- -----------------------------
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
        USING targets t
        WHERE o.bucket_id = 'lgpd_exports'
          AND o.name = t.file_path;
      END IF;

      DELETE FROM public.lgpd_exports e
      USING targets t
      WHERE e.id = t.id;
    END IF;
  END IF;

  -- -------------
  -- app_logs (OPS)
  -- -------------
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

  -- ----------------
  -- audit_logs (DB)
  -- ----------------
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

  -- ---------------------------------
  -- E-commerce operational tables
  -- ---------------------------------
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
    WHERE created_at < now() - v_cut_ecom;
    v_summary := v_summary || jsonb_build_object('ecommerce_job_runs_candidates', v_deleted);
    IF NOT coalesce(p_dry_run,false) AND v_deleted > 0 THEN
      DELETE FROM public.ecommerce_job_runs
      WHERE created_at < now() - v_cut_ecom;
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

  -- --------------------------
  -- Fiscal provider logs/events
  -- --------------------------
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

COMMIT;

