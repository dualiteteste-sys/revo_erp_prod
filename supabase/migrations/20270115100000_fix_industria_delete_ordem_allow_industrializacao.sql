-- =============================================================================
-- Indústria: permitir excluir ordem (OP/OB unificado) em rascunho
-- - Antes, `industria_delete_ordem` aceitava apenas tipo_ordem='beneficiamento'
-- - Isso causava exclusão incorreta via UI (tentava deletar `industria_producao_ordens`)
-- - Regra segura: somente status='rascunho', sem execução gerada e sem entregas
-- =============================================================================
BEGIN;

-- Mantém o wrapper (SEC-02 guard / RBAC) intacto: atualiza apenas a implementação `__unsafe`.
DO $$
BEGIN
  IF to_regprocedure('public.industria_delete_ordem__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_delete_ordem__unsafe(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
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

        -- Agora aceita OP (industrialização) e OB (beneficiamento)
        IF v_tipo NOT IN ('beneficiamento', 'industrializacao') THEN
          RAISE EXCEPTION 'Tipo de ordem não suportado para exclusão.';
        END IF;

        IF v_status <> 'rascunho' THEN
          RAISE EXCEPTION 'Só é possível excluir uma ordem em rascunho.';
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
      $body$;
    $sql$;

    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_delete_ordem__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_delete_ordem__unsafe(uuid) TO service_role, postgres';
  END IF;
END $$;

COMMIT;
