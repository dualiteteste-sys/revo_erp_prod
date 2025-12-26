/*
  RBAC: Permissões para Serviços (OS) + Relatórios de Serviços

  Objetivo:
  - Habilitar controle por usuário/role no módulo de Ordens de Serviço
  - Separar permissão de relatórios (drill-down / KPIs) do CRUD da OS
*/

BEGIN;

-- 1) Permissions
INSERT INTO public.permissions(module, action) VALUES
  ('os','view'),
  ('os','create'),
  ('os','update'),
  ('os','delete'),
  ('os','manage'),
  ('relatorios_servicos','view')
ON CONFLICT (module, action) DO NOTHING;

-- 2) Always grant all permissions to OWNER/ADMIN (including new ones)
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p ON true
WHERE r.slug IN ('OWNER','ADMIN')
ON CONFLICT DO NOTHING;

-- 3) MEMBER: OS full (exceto manage) + relatórios
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module='os' and p.action in ('view','create','update','delete'))
    or (p.module='relatorios_servicos' and p.action='view')
  )
WHERE r.slug = 'MEMBER'
ON CONFLICT DO NOTHING;

-- 4) VIEWER: somente leitura
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module='os' and p.action='view')
    or (p.module='relatorios_servicos' and p.action='view')
  )
WHERE r.slug = 'VIEWER'
ON CONFLICT DO NOTHING;

COMMIT;

