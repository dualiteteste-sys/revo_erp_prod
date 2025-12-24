-- =============================================================================
-- Indústria: exclusão de Ordem de Beneficiamento (OB) com regras de segurança
-- - Permite excluir somente em rascunho e sem Execução gerada / sem entregas
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.industria_delete_ordem(uuid);
DROP FUNCTION IF EXISTS public.industria_delete_ordem__unsafe(uuid);

CREATE OR REPLACE FUNCTION public.industria_delete_ordem__unsafe(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_status text;
  v_execucao uuid;
  v_tipo text;
  v_entregas int;
BEGIN
  SELECT o.status, o.execucao_ordem_id, o.tipo_ordem
    INTO v_status, v_execucao, v_tipo
  FROM public.industria_ordens o
  WHERE o.id = p_id
    AND o.empresa_id = v_empresa_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
  END IF;

  IF v_tipo <> 'beneficiamento' THEN
    RAISE EXCEPTION 'Esta função é destinada à exclusão de Ordens de Beneficiamento.';
  END IF;

  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'Só é possível excluir uma OB em rascunho.';
  END IF;

  IF v_execucao IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível excluir: há operações geradas (Execução).';
  END IF;

  SELECT count(*)
    INTO v_entregas
  FROM public.industria_ordens_entregas e
  WHERE e.ordem_id = p_id
    AND e.empresa_id = v_empresa_id;

  IF v_entregas > 0 THEN
    RAISE EXCEPTION 'Não é possível excluir: há entregas registradas.';
  END IF;

  DELETE FROM public.industria_ordens
  WHERE id = p_id
    AND empresa_id = v_empresa_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.industria_delete_ordem(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_empresa_role_at_least('member');
  PERFORM public.industria_delete_ordem__unsafe(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.industria_delete_ordem__unsafe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_delete_ordem__unsafe(uuid) TO service_role, postgres;
REVOKE ALL ON FUNCTION public.industria_delete_ordem(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.industria_delete_ordem(uuid) TO authenticated, service_role;

COMMIT;

