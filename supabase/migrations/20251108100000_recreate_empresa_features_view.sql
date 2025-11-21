/*
# [MIGRATION] Recriar a VIEW public.empresa_features com security_barrier
Recria a view para usar `WITH (security_barrier = true)` e padroniza a autenticação via `public.current_user_id()`.

## Query Description:
Esta operação substitui a view `empresa_features` para fortalecer a segurança e padronizar a autenticação. A nova view usa `WITH (security_barrier = true)` para prevenir que otimizações do planejador de consultas contornem as políticas de segurança (RLS) das tabelas base. Além disso, a autenticação do usuário passa a ser feita exclusivamente pela função `public.current_user_id()`, que é o padrão seguro do projeto para ler o JWT. Não há impacto em dados existentes, pois é uma alteração de estrutura de leitura.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- VIEW: public.empresa_features (substituída)

## Security Implications:
- RLS Status: A view em si não tem RLS, mas o `security_barrier` reforça o RLS das tabelas `empresas` e `empresa_addons`.
- Policy Changes: No
- Auth Requirements: A view agora depende de `public.current_user_id()`, alinhando-se ao padrão de autenticação do projeto.

## Performance Impact:
- Indexes: Nenhum
- Triggers: Nenhum
- Estimated Impact: Mínimo. O `security_barrier` pode ter um pequeno custo de performance, mas é crucial para a segurança em views complexas.
*/

-- Recriação idempotente da VIEW:
-- Nota: CREATE OR REPLACE VIEW preserva permissões existentes na view.
CREATE OR REPLACE VIEW public.empresa_features
WITH (security_barrier = true)
AS
SELECT
  e.id AS empresa_id,
  EXISTS (
    SELECT 1
    FROM public.empresa_addons ea
    WHERE ea.empresa_id = e.id
      AND ea.addon_slug = 'REVO_SEND'
      AND ea.status = ANY(ARRAY['active'::text, 'trialing'::text])
      AND COALESCE(ea.cancel_at_period_end, false) = false
  ) AS revo_send_enabled
FROM public.empresas e
WHERE EXISTS (
  SELECT 1
  FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = e.id
    AND eu.user_id = public.current_user_id()
);

-- Garante as permissões corretas na view
GRANT SELECT ON public.empresa_features TO authenticated;
