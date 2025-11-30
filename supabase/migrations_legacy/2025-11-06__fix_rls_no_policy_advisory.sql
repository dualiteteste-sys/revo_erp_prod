-- =============================================================================
-- Migração: Adiciona RLS Policies para tabelas de sistema (empresas, profiles)
-- Data: 2025-11-06
-- Descrição:
-- Esta migração corrige o aviso de segurança "RLS Enabled No Policy" ao
-- definir políticas de acesso para as tabelas `empresas`, `profiles` e
-- `empresa_usuarios`. As regras garantem que os usuários só possam ver e
-- editar os dados aos quais pertencem.
-- =============================================================================

-- Tabela: empresas
-- Regra: Usuários podem ver e atualizar empresas das quais são membros.
--        A criação e exclusão são bloqueadas (gerenciadas por RPCs).
DROP POLICY IF EXISTS select_member_empresas ON public.empresas;
CREATE POLICY select_member_empresas ON public.empresas
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT empresa_id FROM public.empresa_usuarios WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS update_member_empresas ON public.empresas;
CREATE POLICY update_member_empresas ON public.empresas
  FOR UPDATE
  TO authenticated
  USING (id IN (SELECT empresa_id FROM public.empresa_usuarios WHERE user_id = auth.uid()))
  WITH CHECK (id IN (SELECT empresa_id FROM public.empresa_usuarios WHERE user_id = auth.uid()));

-- Tabela: profiles
-- Regra: Usuários só podem ver e atualizar seu próprio perfil.
DROP POLICY IF EXISTS select_own_profile ON public.profiles;
CREATE POLICY select_own_profile ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS update_own_profile ON public.profiles;
CREATE POLICY update_own_profile ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Tabela: empresa_usuarios
-- Regra: Usuários podem ver os vínculos das empresas das quais fazem parte.
--        A criação e exclusão são bloqueadas (gerenciadas por RPCs).
DROP POLICY IF EXISTS select_member_links ON public.empresa_usuarios;
CREATE POLICY select_member_links ON public.empresa_usuarios
  FOR SELECT
  TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.empresa_usuarios WHERE user_id = auth.uid()));

-- Log de conclusão
SELECT pg_notify('app_log', '[RLS] Applied policies to core tables (empresas, profiles, empresa_usuarios)');
