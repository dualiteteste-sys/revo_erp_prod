-- =============================================================================
-- Hotfix: Corrigir Alerta de Segurança "Security Definer View"
-- Causa: A view `empresa_features` pode estar sendo interpretada como
--        `SECURITY DEFINER`, o que é um risco de segurança em ambientes multi-tenant.
-- Ação: Recriar a view explicitando `security_invoker = true` para garantir
--        que ela sempre execute com as permissões do usuário que a consulta,
--        respeitando o RLS das tabelas base.
-- =============================================================================

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

COMMENT ON VIEW public.empresa_features IS 'View segura (security_invoker e security_barrier) que expõe features ativas para a empresa do usuário logado.';

-- Notificar o PostgREST para recarregar o schema e reconhecer a view atualizada
SELECT pg_notify('pgrst', 'reload schema');
