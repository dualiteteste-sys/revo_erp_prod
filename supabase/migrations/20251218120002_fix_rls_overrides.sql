/*
# [SECURITY FIX] RLS completo em public.user_permission_overrides
- Habilita e FORÇA RLS
- Políticas por operação (idempotentes)
- Padrões: funções de contexto já existentes (current_user_id/current_empresa_id)
*/

-- 1) Habilitar e forçar RLS
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides FORCE ROW LEVEL SECURITY;

-- 2) Políticas por operação (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_permission_overrides'
      AND policyname='upo_select_own_company'
  ) THEN
    EXECUTE $p$
      CREATE POLICY upo_select_own_company
      ON public.user_permission_overrides
      FOR SELECT TO authenticated
      USING (empresa_id = public.current_empresa_id());
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_permission_overrides'
      AND policyname='upo_insert_own_company'
  ) THEN
    EXECUTE $p$
      CREATE POLICY upo_insert_own_company
      ON public.user_permission_overrides
      FOR INSERT TO authenticated
      WITH CHECK (empresa_id = public.current_empresa_id());
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_permission_overrides'
      AND policyname='upo_update_own_company'
  ) THEN
    EXECUTE $p$
      CREATE POLICY upo_update_own_company
      ON public.user_permission_overrides
      FOR UPDATE TO authenticated
      USING (empresa_id = public.current_empresa_id())
      WITH CHECK (empresa_id = public.current_empresa_id());
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_permission_overrides'
      AND policyname='upo_delete_own_company'
  ) THEN
    EXECUTE $p$
      CREATE POLICY upo_delete_own_company
      ON public.user_permission_overrides
      FOR DELETE TO authenticated
      USING (empresa_id = public.current_empresa_id());
    $p$;
  END IF;
END
$$;

-- 3) Recarregar schema do PostgREST
SELECT pg_notify('pgrst','reload schema');
