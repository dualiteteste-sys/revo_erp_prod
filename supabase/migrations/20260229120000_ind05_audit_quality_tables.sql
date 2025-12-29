-- =============================================================================
-- IND-05: Qualidade mínimo (auditoria)
-- - Habilita audit_logs_trigger em tabelas de Qualidade e em estoque_lotes (status_qa)
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL OR to_regprocedure('public.process_audit_log()') IS NULL THEN
    RAISE NOTICE 'IND-05: audit_logs/process_audit_log não encontrado; pulando triggers de auditoria.';
    RETURN;
  END IF;

  -- Qualidade: motivos
  IF to_regclass('public.industria_qualidade_motivos') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_qualidade_motivos';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_qualidade_motivos FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  -- Qualidade: planos
  IF to_regclass('public.industria_qualidade_planos') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_qualidade_planos';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_qualidade_planos FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  -- Qualidade: características do plano
  IF to_regclass('public.industria_qualidade_plano_caracteristicas') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_qualidade_plano_caracteristicas';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_qualidade_plano_caracteristicas FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  -- Qualidade: inspeções
  IF to_regclass('public.industria_qualidade_inspecoes') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_qualidade_inspecoes';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_qualidade_inspecoes FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  -- Lotes: status_qa é fonte da tela "Lotes & Bloqueio"
  IF to_regclass('public.estoque_lotes') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.estoque_lotes';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.estoque_lotes FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
END $$;

-- Força reload do schema cache do PostgREST (evita 404 em /rpc após migração)
NOTIFY pgrst, 'reload schema';

COMMIT;

