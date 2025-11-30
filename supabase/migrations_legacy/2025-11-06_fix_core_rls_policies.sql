-- =============================================================================
-- Migração: RLS para empresas, profiles e empresa_usuarios (normalização)
-- Data: 2025-11-06
-- Objetivos:
-- - Remover policies antigas com {public} e nomes legados.
-- - Garantir RLS consistente: somente usuários autenticados.
-- - Evitar subselect recursivo em empresa_usuarios (usar user_id = auth.uid()).
-- - (Opcional conforme descrição) Bloquear mutações diretas em empresa_usuarios.
-- =============================================================================

-- =========================
-- PROFILES
-- =========================
-- Remover políticas legadas ({public})
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- Recriar somente para usuários autenticados
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =========================
-- EMPRESAS
-- =========================
-- Remover políticas legadas ({public})
DROP POLICY IF EXISTS "Membros podem ver as empresas das quais participam" ON public.empresas;
DROP POLICY IF EXISTS "Admins podem atualizar suas empresas" ON public.empresas;
DROP POLICY IF EXISTS "Admins podem deletar suas empresas" ON public.empresas;

-- Criar políticas novas (membros podem ver e atualizar; criar/excluir bloqueado)
CREATE POLICY empresas_select_member
  ON public.empresas FOR SELECT
  TO authenticated
  USING (id IN (
    SELECT eu.empresa_id
    FROM public.empresa_usuarios eu
    WHERE eu.user_id = auth.uid()
  ));

CREATE POLICY empresas_update_member
  ON public.empresas FOR UPDATE
  TO authenticated
  USING (id IN (
    SELECT eu.empresa_id
    FROM public.empresa_usuarios eu
    WHERE eu.user_id = auth.uid()
  ))
  WITH CHECK (id IN (
    SELECT eu.empresa_id
    FROM public.empresa_usuarios eu
    WHERE eu.user_id = auth.uid()
  ));

-- OBS: Sem políticas de INSERT/DELETE => operações bloqueadas pelo RLS (via RPCs).

-- =========================
-- EMPRESA_USUARIOS
-- =========================
-- Remover políticas legadas ({public})
DROP POLICY IF EXISTS "Usuários podem ver suas próprias associações" ON public.empresa_usuarios;
DROP POLICY IF EXISTS "Admins podem adicionar usuários à sua empresa" ON public.empresa_usuarios;
DROP POLICY IF EXISTS "Admins podem atualizar roles de usuários" ON public.empresa_usuarios;
DROP POLICY IF EXISTS "Usuários e admins podem se remover de uma empresa" ON public.empresa_usuarios;

-- SELECT: somente linhas do próprio usuário (evita subselect recursivo)
CREATE POLICY empresa_usuarios_select_own
  ON public.empresa_usuarios FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- A) Bloqueando mutações diretas e forçando via RPCs:
-- (não são criadas políticas de INSERT/UPDATE/DELETE; operações ficam bloqueadas pelo RLS)

-- =========================
-- Telemetria
-- =========================
SELECT pg_notify('app_log',
  '[RLS] normalized core tables: profiles, empresas, empresa_usuarios (auth-only; no public)'
);
