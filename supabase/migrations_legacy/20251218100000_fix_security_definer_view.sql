/*
# [CRITICAL-FIX] Harden View Security
[This migration addresses a critical security advisory by explicitly setting `security_invoker=true` on the `empresa_features` view. This ensures that Row-Level Security (RLS) from the underlying tables is always enforced based on the permissions of the user running the query, preventing potential data leaks between tenants. The `security_barrier` property is also maintained to prevent query planner optimizations that could bypass RLS.]

## Query Description: [This operation modifies the `empresa_features` view to enforce user-level permissions, which is a critical security enhancement. It is a safe, non-destructive change that improves data isolation between tenants. No backup is required.]

## Metadata:
- Schema-Category: ["Structural", "Safe"]
- Impact-Level: ["Low"]
- Requires-Backup: [false]
- Reversible: [true]

## Structure Details:
- Modifies VIEW: `public.empresa_features`

## Security Implications:
- RLS Status: [Enforced]
- Policy Changes: [No]
- Auth Requirements: [authenticated]
- Fixes Advisory: [Security Definer View]

## Performance Impact:
- Indexes: [None]
- Triggers: [None]
- Estimated Impact: [Negligible. The `security_barrier` may have a minor performance cost, but it is essential for security.]
*/

-- Recria a view com `security_invoker` e `security_barrier` explícitos para garantir a segurança.
CREATE OR REPLACE VIEW public.empresa_features
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  e.id AS empresa_id,
  EXISTS (
    SELECT 1
    FROM public.empresa_addons ea
    WHERE ea.empresa_id = e.id
      AND ea.addon_slug = 'REVO_SEND'
      AND ea.status = ANY (ARRAY['active'::text, 'trialing'::text])
      AND COALESCE(ea.cancel_at_period_end, false) = false
  ) AS revo_send_enabled
FROM public.empresas e
WHERE EXISTS (
  SELECT 1
  FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = e.id
    AND eu.user_id = public.current_user_id()
);

COMMENT ON VIEW public.empresa_features IS 'View segura que mostra as features ativas para a empresa do usuário logado, aplicando RLS das tabelas base.';

-- Notifica o PostgREST para recarregar o schema e reconhecer a view atualizada.
SELECT pg_notify('pgrst', 'reload schema');
