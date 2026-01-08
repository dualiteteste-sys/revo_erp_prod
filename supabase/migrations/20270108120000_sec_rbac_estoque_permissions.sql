/*
  SEC-RBAC: Permissões para módulo "estoque"

  Contexto:
  - RPCs de multi-estoque/depósitos usam `require_permission_for_current_user('estoque', ...)`.
  - Sem essas permissões seedadas, usuários (incl. OWNER/ADMIN em bases antigas) recebem 403.

  O que faz:
  - Adiciona permissões: estoque/view e estoque/update.
  - Concede:
    - OWNER/ADMIN: view + update
    - MEMBER/OPS: view + update
    - FINANCE/VIEWER: view
*/

BEGIN;

-- 1) Permissões
INSERT INTO public.permissions(module, action) VALUES
  ('estoque','view'),
  ('estoque','update')
ON CONFLICT (module, action) DO NOTHING;

-- 2) Seeds (role_permissions)
-- OWNER/ADMIN: sempre tudo para as permissões novas também
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p ON p.module = 'estoque' AND p.action IN ('view','update')
WHERE r.slug IN ('OWNER','ADMIN')
ON CONFLICT DO NOTHING;

-- MEMBER/OPS: pode operar estoque (view + update)
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p ON p.module = 'estoque' AND p.action IN ('view','update')
WHERE r.slug IN ('MEMBER','OPS')
ON CONFLICT DO NOTHING;

-- FINANCE/VIEWER: somente leitura
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p ON p.module = 'estoque' AND p.action = 'view'
WHERE r.slug IN ('FINANCE','VIEWER')
ON CONFLICT DO NOTHING;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

