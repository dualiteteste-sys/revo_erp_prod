-- =============================================================================
-- Migração: Normalização de RLS em transportadoras e tags
-- Data: 2025-11-05
-- Impacto:
-- - Segurança: remove acesso via 'public' e regra indireta is_user_member_of.
-- - Compatibilidade: front continua operando via usuário autenticado.
-- - Reversão: recriar policies antigas se necessário (não recomendado).
-- =============================================================================

-- 1) TRANSPORTADORAS: remover policies legadas (mantém as *_own_company já existentes)
DROP POLICY IF EXISTS transportadoras_sel ON public.transportadoras;
DROP POLICY IF EXISTS transportadoras_ins ON public.transportadoras;
DROP POLICY IF EXISTS transportadoras_upd ON public.transportadoras;
DROP POLICY IF EXISTS transportadoras_del ON public.transportadoras;

-- 2) TAGS: substituir totalmente pelo padrão own_company
DROP POLICY IF EXISTS tags_sel ON public.tags;
DROP POLICY IF EXISTS tags_ins ON public.tags;
DROP POLICY IF EXISTS tags_upd ON public.tags;
DROP POLICY IF EXISTS tags_del ON public.tags;

CREATE POLICY tags_select_own_company
  ON public.tags FOR SELECT
  TO authenticated
  USING (empresa_id = public.current_empresa_id());

CREATE POLICY tags_insert_own_company
  ON public.tags FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY tags_update_own_company
  ON public.tags FOR UPDATE
  TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY tags_delete_own_company
  ON public.tags FOR DELETE
  TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- 3) Telemetria
SELECT pg_notify('app_log', '[RLS] normalized: transportadoras(tags) -> authenticated + empresa_id = current_empresa_id()');

-- 4) Smoke-check rápido
-- Deve listar apenas policies *_own_company
-- SELECT schemaname, tablename, policyname, cmd AS polcmd, roles
-- FROM pg_policies
-- WHERE (schemaname, tablename) IN (('public','transportadoras'), ('public','tags'))
-- ORDER BY tablename, cmd, policyname;
