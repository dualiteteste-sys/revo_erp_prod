-- Fix: OP delete retornava "sucesso" mas não excluía quando RLS/empresa ativa não permitia afetar a linha.
-- Também fixa vazamento de tenant em `industria_producao_get_ordem_details` (faltava filtrar por empresa_id).

BEGIN;

-- -----------------------------------------------------------------------------
-- OP: detalhes devem respeitar empresa ativa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.industria_producao_get_ordem_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_ordem record;
  v_componentes jsonb;
  v_entregas jsonb;
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  SELECT
    o.*,
    p.nome AS produto_nome
    INTO v_ordem
    FROM public.industria_producao_ordens o
    JOIN public.produtos p ON p.id = o.produto_final_id
   WHERE o.id = p_id
     AND o.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'ordem_id', c.ordem_id,
      'produto_id', c.produto_id,
      'produto_nome', p.nome,
      'quantidade_planejada', c.quantidade_planejada,
      'quantidade_consumida', c.quantidade_consumida,
      'quantidade_reservada', c.quantidade_reservada,
      'unidade', c.unidade,
      'origem', c.origem
    )
  )
  INTO v_componentes
  FROM public.industria_producao_componentes c
  JOIN public.produtos p ON p.id = c.produto_id
  WHERE c.ordem_id = p_id
    AND c.empresa_id = v_empresa_id;

  SELECT jsonb_agg(e)
  INTO v_entregas
  FROM public.industria_producao_entregas e
  WHERE e.ordem_id = p_id
    AND e.empresa_id = v_empresa_id;

  RETURN jsonb_build_object(
    'id', v_ordem.id,
    'empresa_id', v_ordem.empresa_id,
    'numero', v_ordem.numero,
    'origem_ordem', v_ordem.origem_ordem,
    'produto_final_id', v_ordem.produto_final_id,
    'produto_nome', v_ordem.produto_nome,
    'quantidade_planejada', v_ordem.quantidade_planejada,
    'unidade', v_ordem.unidade,
    'status', v_ordem.status,
    'prioridade', v_ordem.prioridade,
    'data_prevista_inicio', v_ordem.data_prevista_inicio,
    'data_prevista_fim', v_ordem.data_prevista_fim,
    'data_prevista_entrega', v_ordem.data_prevista_entrega,
    'documento_ref', v_ordem.documento_ref,
    'observacoes', v_ordem.observacoes,
    'roteiro_aplicado_id', v_ordem.roteiro_aplicado_id,
    'roteiro_aplicado_desc', v_ordem.roteiro_aplicado_desc,
    'bom_aplicado_id', v_ordem.bom_aplicado_id,
    'bom_aplicado_desc', v_ordem.bom_aplicado_desc,
    'lote_producao', v_ordem.lote_producao,
    'reserva_modo', v_ordem.reserva_modo,
    'tolerancia_overrun_percent', v_ordem.tolerancia_overrun_percent,
    'created_at', v_ordem.created_at,
    'updated_at', v_ordem.updated_at,
    'componentes', coalesce(v_componentes, '[]'::jsonb),
    'entregas', coalesce(v_entregas, '[]'::jsonb)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.industria_producao_get_ordem_details(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OP: delete robusto (deve falhar se nada for excluído)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.industria_producao_ordens_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_ordens_delete__unsafe(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      DECLARE
        v_empresa_id uuid := public.current_empresa_id();
        v_status text;
        v_deleted int := 0;
      BEGIN
        SELECT status
          INTO v_status
          FROM public.industria_producao_ordens
         WHERE id = p_id
           AND empresa_id = v_empresa_id;

        IF v_status IS NULL THEN
          RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
        END IF;

        IF v_status <> 'rascunho' THEN
          RAISE EXCEPTION 'Somente ordens em rascunho podem ser excluídas.';
        END IF;

        IF EXISTS (
          SELECT 1
            FROM public.industria_producao_operacoes
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui operações.';
        END IF;

        IF to_regclass('public.industria_producao_entregas') IS NOT NULL AND EXISTS (
          SELECT 1
            FROM public.industria_producao_entregas
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui entregas.';
        END IF;

        DELETE FROM public.industria_producao_ordens
         WHERE id = p_id AND empresa_id = v_empresa_id;

        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        IF v_deleted <> 1 THEN
          RAISE EXCEPTION 'Exclusão não realizada (ordem preservada por integridade/permissão).';
        END IF;
      END;
      $body$;
    $sql$;

    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_ordens_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_ordens_delete__unsafe(uuid) TO service_role, postgres';
  ELSE
    -- Ambiente sem RBAC wrappers: atualiza a função "normal".
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_ordens_delete(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      DECLARE
        v_empresa_id uuid := public.current_empresa_id();
        v_status text;
        v_deleted int := 0;
      BEGIN
        SELECT status
          INTO v_status
          FROM public.industria_producao_ordens
         WHERE id = p_id
           AND empresa_id = v_empresa_id;

        IF v_status IS NULL THEN
          RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
        END IF;

        IF v_status <> 'rascunho' THEN
          RAISE EXCEPTION 'Somente ordens em rascunho podem ser excluídas.';
        END IF;

        IF EXISTS (
          SELECT 1
            FROM public.industria_producao_operacoes
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui operações.';
        END IF;

        IF to_regclass('public.industria_producao_entregas') IS NOT NULL AND EXISTS (
          SELECT 1
            FROM public.industria_producao_entregas
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui entregas.';
        END IF;

        DELETE FROM public.industria_producao_ordens
         WHERE id = p_id AND empresa_id = v_empresa_id;

        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        IF v_deleted <> 1 THEN
          RAISE EXCEPTION 'Exclusão não realizada (ordem preservada por integridade/permissão).';
        END IF;
      END;
      $body$;
    $sql$;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_ordens_delete(uuid) TO authenticated, service_role';
  END IF;
END $$;

COMMIT;

