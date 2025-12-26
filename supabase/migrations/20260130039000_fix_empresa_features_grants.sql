/*
  Fix: empresa_features 403 (permission denied)

  A view `public.empresa_features` usa `security_invoker = true`, então o role `authenticated`
  precisa de privilégios de SELECT nas tabelas base consultadas pela view.
*/

BEGIN;

-- Tabelas base usadas pela view public.empresa_features
GRANT SELECT ON TABLE public.empresas TO authenticated;
GRANT SELECT ON TABLE public.empresa_usuarios TO authenticated;
GRANT SELECT ON TABLE public.empresa_addons TO authenticated;
GRANT SELECT ON TABLE public.empresa_feature_flags TO authenticated;
GRANT SELECT ON TABLE public.empresa_entitlements TO authenticated;

-- View
GRANT SELECT ON public.empresa_features TO authenticated;

-- Força reload do schema no PostgREST
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

