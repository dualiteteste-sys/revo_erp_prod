-- Corrige funções que ainda apontavam para a tabela inexistente
-- public.industria_roteiro_etapas (singular). O nome correto é
-- public.industria_roteiros_etapas.

BEGIN;

CREATE OR REPLACE FUNCTION public.industria_producao_gerar_operacoes(p_ordem_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_ordem record;
    v_exists boolean;
BEGIN
    SELECT produto_final_id, roteiro_aplicado_id, quantidade_planejada
      INTO v_ordem
      FROM public.industria_producao_ordens
     WHERE id = p_ordem_id
       AND empresa_id = v_empresa_id;

    IF v_ordem.roteiro_aplicado_id IS NULL THEN
        RAISE EXCEPTION 'A ordem não possui um roteiro aplicado.';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.industria_producao_operacoes WHERE ordem_id = p_ordem_id
    ) INTO v_exists;

    IF v_exists THEN
        RAISE EXCEPTION 'Operações já foram geradas para esta ordem.';
    END IF;

    INSERT INTO public.industria_producao_operacoes (
        empresa_id,
        ordem_id,
        sequencia,
        centro_trabalho_id,
        centro_trabalho_nome,
        descricao,
        tempo_planejado_minutos,
        quantidade_planejada,
        status,
        permite_overlap,
        roteiro_etapa_id,
        require_ip,
        require_if
    )
    SELECT
        v_empresa_id,
        p_ordem_id,
        e.sequencia,
        e.centro_trabalho_id,
        COALESCE(ct.nome, e.descricao, 'Centro não definido') AS centro_trabalho_nome,
        COALESCE(e.descricao, 'Etapa ' || e.sequencia::text) AS descricao,
        COALESCE(e.tempo_setup_minutos, 0) + (COALESCE(e.tempo_producao_minutos, 0) * v_ordem.quantidade_planejada),
        v_ordem.quantidade_planejada,
        'pendente',
        COALESCE(e.permitir_overlap, false),
        e.id,
        COALESCE(qa.require_ip, false),
        COALESCE(qa.require_if, false)
    FROM public.industria_roteiros_etapas e
    LEFT JOIN public.industria_centros_trabalho ct ON ct.id = e.centro_trabalho_id
    LEFT JOIN LATERAL (
        SELECT
            bool_or(p.tipo = 'IP') AS require_ip,
            bool_or(p.tipo = 'IF') AS require_if
        FROM public.industria_qualidade_planos p
        WHERE p.empresa_id = v_empresa_id
          AND p.ativo = true
          AND p.produto_id = v_ordem.produto_final_id
          AND (
                (p.roteiro_etapa_id IS NOT NULL AND p.roteiro_etapa_id = e.id)
             OR (p.roteiro_etapa_id IS NULL AND p.roteiro_id IS NOT NULL AND p.roteiro_id = e.roteiro_id)
             OR (p.roteiro_etapa_id IS NULL AND p.roteiro_id IS NULL)
          )
    ) qa ON TRUE
    WHERE e.roteiro_id = v_ordem.roteiro_aplicado_id
      AND e.empresa_id = v_empresa_id
    ORDER BY e.sequencia ASC;

    UPDATE public.industria_producao_ordens
       SET status = 'em_programacao'
     WHERE id = p_ordem_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.qualidade_reprocessar_operacoes_por_produto(p_produto_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
BEGIN
    WITH operacoes_alvo AS (
        SELECT
            o.id AS operacao_id,
            COALESCE(
                bool_or(CASE WHEN p.tipo = 'IP' THEN true END),
                false
            ) AS require_ip,
            COALESCE(
                bool_or(CASE WHEN p.tipo = 'IF' THEN true END),
                false
            ) AS require_if
        FROM public.industria_producao_operacoes o
        JOIN public.industria_producao_ordens ord
          ON ord.id = o.ordem_id
        LEFT JOIN public.industria_roteiros_etapas etapa
          ON etapa.id = o.roteiro_etapa_id
        LEFT JOIN public.industria_qualidade_planos p
          ON p.empresa_id = v_empresa_id
         AND p.ativo = true
         AND p.produto_id = ord.produto_final_id
         AND (
                (p.roteiro_etapa_id IS NOT NULL AND p.roteiro_etapa_id = o.roteiro_etapa_id)
             OR (p.roteiro_etapa_id IS NULL AND p.roteiro_id IS NOT NULL AND etapa.roteiro_id IS NOT NULL AND p.roteiro_id = etapa.roteiro_id)
             OR (p.roteiro_etapa_id IS NULL AND p.roteiro_id IS NULL)
          )
        WHERE ord.produto_final_id = p_produto_id
          AND ord.empresa_id = v_empresa_id
        GROUP BY o.id
    )
    UPDATE public.industria_producao_operacoes o
       SET require_ip = operacoes_alvo.require_ip,
           require_if = operacoes_alvo.require_if,
           updated_at = now()
      FROM operacoes_alvo
     WHERE o.id = operacoes_alvo.operacao_id;
END;
$$;

COMMIT;
