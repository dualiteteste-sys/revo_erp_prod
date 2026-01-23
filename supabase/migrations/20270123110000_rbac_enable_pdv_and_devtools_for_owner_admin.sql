/*
  RBAC hardening: garantir que OWNER/ADMIN tenham acesso aos módulos necessários
  para o plano PRO (e para operação do sistema):
  - Vendas (inclui PDV)
  - Ferramentas internas (Desenvolvedor) via permissões ops/view e ops/manage

  Motivação:
  - Em ambientes com drift (migrations parciais/antigas), pode faltar seed de
    permissões/role_permissions, causando "locks" no menu e 403 inesperados.
*/

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.permissions') IS NULL OR to_regclass('public.roles') IS NULL OR to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;

  -- Garantir catálogo de permissões essenciais
  INSERT INTO public.permissions(module, action) VALUES
    ('vendas','view'),
    ('vendas','create'),
    ('vendas','update'),
    ('vendas','delete'),
    ('vendas','manage'),
    ('ops','view'),
    ('ops','manage')
  ON CONFLICT (module, action) DO NOTHING;

  -- Garantir OWNER/ADMIN com acesso total a essas permissões
  INSERT INTO public.role_permissions(role_id, permission_id, allow)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permissions p ON p.module IN ('vendas','ops')
  WHERE r.slug IN ('OWNER','ADMIN')
  ON CONFLICT DO NOTHING;
END;
$$;

-- Forçar PostgREST a recarregar schema/permissions (útil após seed)
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

