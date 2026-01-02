/*
  SEC-RBAC-03: Perfis prontos + auditoria de mudanças

  Objetivo:
  - Garantir presets consistentes para Owner/Admin/Finance/Ops/Member/Viewer (inclui action 'export').
  - Registrar auditoria quando permissões/overrides forem alterados.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Preset: para cada role, se tem `view` em um módulo, também ganha `export`.
--    (export não amplia escopo de dados, apenas facilita extração do que já pode ver)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.roles') IS NULL OR to_regclass('public.permissions') IS NULL OR to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.role_permissions(role_id, permission_id, allow)
  SELECT rp.role_id, pexp.id, true
  FROM public.role_permissions rp
  JOIN public.permissions pview
    ON pview.id = rp.permission_id
   AND pview.action = 'view'
  JOIN public.permissions pexp
    ON pexp.module = pview.module
   AND pexp.action = 'export'
  ON CONFLICT DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Auditoria: habilitar audit_logs_trigger em tabelas de RBAC (se infra existir)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL OR to_regprocedure('public.process_audit_log()') IS NULL THEN
    RAISE NOTICE 'SEC-RBAC-03: audit_logs/process_audit_log não encontrado; pulando triggers de auditoria.';
    RETURN;
  END IF;

  IF to_regclass('public.user_permission_overrides') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.user_permission_overrides';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
END $$;

COMMIT;
