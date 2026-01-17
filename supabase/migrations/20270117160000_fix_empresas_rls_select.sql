/*
  P1.1 (Estado da Arte 9/10): RLS de `public.empresas`

  Problema:
  - Existia policy de SELECT com `using (true)` em `public.empresas`,
    permitindo leitura ampla e criando risco de vazamento entre tenants.

  Solução:
  - Restringir SELECT a membros da empresa (via `empresa_usuarios`) e/ou owner.
  - Manter acesso do `service_role` (backend/edge functions) via policy dedicada.
*/

BEGIN;

-- Garantir RLS habilitado.
ALTER TABLE IF EXISTS public.empresas ENABLE ROW LEVEL SECURITY;

-- Remover policy insegura (legado).
DROP POLICY IF EXISTS "Enable read access for all users" ON public.empresas;

-- Policy: usuário autenticado só enxerga empresas onde é membro (ou owner).
DROP POLICY IF EXISTS empresas_select_member ON public.empresas;
CREATE POLICY empresas_select_member
  ON public.empresas
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = empresas.id
        AND eu.user_id = auth.uid()
    )
  );

-- Policy: service_role (Edge Functions / jobs) pode ler empresas.
DROP POLICY IF EXISTS empresas_select_service_role ON public.empresas;
CREATE POLICY empresas_select_service_role
  ON public.empresas
  FOR SELECT
  TO service_role
  USING (true);

COMMIT;

