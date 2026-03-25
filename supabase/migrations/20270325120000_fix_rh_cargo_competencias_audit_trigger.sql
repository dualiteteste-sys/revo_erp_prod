/*
  # Fix: adicionar trigger de auditoria em rh_cargo_competencias

  ## Descrição
  A tabela rh_cargo_competencias (vínculo cargo→competência) não tinha o trigger
  de auditoria, então alterações nas competências requeridas de um cargo não
  apareciam na aba Histórico.

  ## Impact Summary
  - Segurança: idempotente (DROP IF EXISTS + CREATE)
  - Performance: nenhum impacto (trigger leve, só dispara em INSERT/UPDATE/DELETE)
*/

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.rh_cargo_competencias') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.rh_cargo_competencias';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.rh_cargo_competencias FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
END;
$$;
