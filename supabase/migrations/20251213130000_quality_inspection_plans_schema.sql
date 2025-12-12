-- =============================================================================
-- QA Inspection Plans master data & automatic gating by roteiro/etapa
-- =============================================================================

BEGIN;

-- 1) Adjust inspection plan references (remove operacao_id, add roteiro/etapa)
ALTER TABLE public.industria_qualidade_planos
    DROP COLUMN IF EXISTS operacao_id;

ALTER TABLE public.industria_qualidade_planos
    ADD COLUMN IF NOT EXISTS roteiro_id uuid REFERENCES public.industria_roteiros(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS roteiro_etapa_id uuid REFERENCES public.industria_roteiros_etapas(id) ON DELETE SET NULL;

-- 2) Operations now reference the origem da etapa para relacionar QA
ALTER TABLE public.industria_producao_operacoes
    ADD COLUMN IF NOT EXISTS roteiro_etapa_id uuid REFERENCES public.industria_roteiros_etapas(id) ON DELETE SET NULL;

-- 3) Rebuild gerar_operacoes to preencher roteiro_etapa e requisitos QA
DROP FUNCTION IF EXISTS public.industria_producao_gerar_operacoes(uuid);
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
    FROM public.industria_roteiro_etapas e
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

-- 4) Helper to recalculate QA requisitos para todas operações de um produto
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
        LEFT JOIN public.industria_roteiro_etapas etapa
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

-- 5) Inspection plan CRUD RPCs
DROP FUNCTION IF EXISTS public.qualidade_planos_list(text);
CREATE OR REPLACE FUNCTION public.qualidade_planos_list(p_search text DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    nome text,
    produto_id uuid,
    produto_nome text,
    tipo text,
    severidade text,
    aql text,
    amostragem text,
    ativo boolean,
    roteiro_id uuid,
    roteiro_nome text,
    roteiro_etapa_id uuid,
    etapa_nome text,
    etapa_sequencia integer,
    total_caracteristicas integer,
    updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT
        p.id,
        p.nome,
        p.produto_id,
        prod.nome AS produto_nome,
        p.tipo,
        p.severidade,
        p.aql,
        p.amostragem,
        p.ativo,
        p.roteiro_id,
        r.descricao AS roteiro_nome,
        p.roteiro_etapa_id,
        COALESCE(e.descricao, 'Etapa ' || e.sequencia::text) AS etapa_nome,
        e.sequencia AS etapa_sequencia,
        COALESCE(c.total, 0) AS total_caracteristicas,
        p.updated_at
    FROM public.industria_qualidade_planos p
    JOIN public.produtos prod ON prod.id = p.produto_id
    LEFT JOIN public.industria_roteiros r ON r.id = p.roteiro_id
    LEFT JOIN public.industria_roteiros_etapas e ON e.id = p.roteiro_etapa_id
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM public.industria_qualidade_plano_caracteristicas c
        WHERE c.plano_id = p.id
          AND c.empresa_id = public.current_empresa_id()
    ) c ON TRUE
    WHERE p.empresa_id = public.current_empresa_id()
      AND (
           p_search IS NULL
        OR p.nome ILIKE '%' || p_search || '%'
        OR prod.nome ILIKE '%' || p_search || '%'
        OR COALESCE(e.descricao, '') ILIKE '%' || p_search || '%'
      )
    ORDER BY p.updated_at DESC, p.nome ASC;
$$;

DROP FUNCTION IF EXISTS public.qualidade_plano_get(uuid);
CREATE OR REPLACE FUNCTION public.qualidade_plano_get(p_id uuid)
RETURNS TABLE (
    id uuid,
    nome text,
    produto_id uuid,
    produto_nome text,
    tipo text,
    severidade text,
    aql text,
    amostragem text,
    ativo boolean,
    roteiro_id uuid,
    roteiro_nome text,
    roteiro_etapa_id uuid,
    etapa_nome text,
    etapa_sequencia integer,
    caracteristicas jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT
        p.id,
        p.nome,
        p.produto_id,
        prod.nome AS produto_nome,
        p.tipo,
        p.severidade,
        p.aql,
        p.amostragem,
        p.ativo,
        p.roteiro_id,
        r.descricao AS roteiro_nome,
        p.roteiro_etapa_id,
        COALESCE(e.descricao, 'Etapa ' || e.sequencia::text) AS etapa_nome,
        e.sequencia AS etapa_sequencia,
        COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', c.id,
                'descricao', c.descricao,
                'tolerancia_min', c.tolerancia_min,
                'tolerancia_max', c.tolerancia_max,
                'unidade', c.unidade,
                'instrumento', c.instrumento
            ) ORDER BY c.created_at DESC)
            FROM public.industria_qualidade_plano_caracteristicas c
            WHERE c.plano_id = p.id
              AND c.empresa_id = p.empresa_id
        ), '[]'::jsonb) AS caracteristicas
    FROM public.industria_qualidade_planos p
    JOIN public.produtos prod ON prod.id = p.produto_id
    LEFT JOIN public.industria_roteiros r ON r.id = p.roteiro_id
    LEFT JOIN public.industria_roteiros_etapas e ON e.id = p.roteiro_etapa_id
    WHERE p.id = p_id
      AND p.empresa_id = public.current_empresa_id();
$$;

DROP FUNCTION IF EXISTS public.qualidade_planos_upsert(text, uuid, text, uuid, text, text, text, uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.qualidade_planos_upsert(
    p_nome text,
    p_produto_id uuid,
    p_tipo text,
    p_id uuid DEFAULT NULL,
    p_severidade text DEFAULT NULL,
    p_aql text DEFAULT NULL,
    p_amostragem text DEFAULT NULL,
    p_roteiro_id uuid DEFAULT NULL,
    p_roteiro_etapa_id uuid DEFAULT NULL,
    p_ativo boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_id uuid := p_id;
    v_old_produto uuid;
BEGIN
    IF v_id IS NULL THEN
        INSERT INTO public.industria_qualidade_planos (
            empresa_id, nome, produto_id, tipo, severidade, aql, amostragem,
            roteiro_id, roteiro_etapa_id, ativo
        ) VALUES (
            v_empresa_id, p_nome, p_produto_id, p_tipo, p_severidade, p_aql, p_amostragem,
            p_roteiro_id, p_roteiro_etapa_id, COALESCE(p_ativo, true)
        )
        RETURNING id INTO v_id;
    ELSE
        SELECT produto_id INTO v_old_produto
        FROM public.industria_qualidade_planos
        WHERE id = v_id AND empresa_id = v_empresa_id;

        UPDATE public.industria_qualidade_planos
           SET nome = p_nome,
               produto_id = p_produto_id,
               tipo = p_tipo,
               severidade = p_severidade,
               aql = p_aql,
               amostragem = p_amostragem,
               roteiro_id = p_roteiro_id,
               roteiro_etapa_id = p_roteiro_etapa_id,
               ativo = COALESCE(p_ativo, true),
               updated_at = now()
         WHERE id = v_id
           AND empresa_id = v_empresa_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Plano não encontrado para atualização.';
        END IF;
    END IF;

    PERFORM public.qualidade_reprocessar_operacoes_por_produto(p_produto_id);
    IF v_old_produto IS NOT NULL AND v_old_produto <> p_produto_id THEN
        PERFORM public.qualidade_reprocessar_operacoes_por_produto(v_old_produto);
    END IF;

    RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.qualidade_planos_delete(uuid);
CREATE OR REPLACE FUNCTION public.qualidade_planos_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_produto_id uuid;
BEGIN
    SELECT produto_id INTO v_produto_id
    FROM public.industria_qualidade_planos
    WHERE id = p_id AND empresa_id = v_empresa_id;

    IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'Plano não encontrado.';
    END IF;

    DELETE FROM public.industria_qualidade_planos
    WHERE id = p_id AND empresa_id = v_empresa_id;

    PERFORM public.qualidade_reprocessar_operacoes_por_produto(v_produto_id);
END;
$$;

DROP FUNCTION IF EXISTS public.qualidade_plano_upsert_caracteristica(uuid, text, uuid, numeric, numeric, text, text);
CREATE OR REPLACE FUNCTION public.qualidade_plano_upsert_caracteristica(
    p_plano_id uuid,
    p_descricao text,
    p_id uuid DEFAULT NULL,
    p_tolerancia_min numeric DEFAULT NULL,
    p_tolerancia_max numeric DEFAULT NULL,
    p_unidade text DEFAULT NULL,
    p_instrumento text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_id uuid := p_id;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.industria_qualidade_planos
        WHERE id = p_plano_id AND empresa_id = v_empresa_id
    ) THEN
        RAISE EXCEPTION 'Plano não encontrado.';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO public.industria_qualidade_plano_caracteristicas (
            empresa_id, plano_id, descricao, tolerancia_min, tolerancia_max, unidade, instrumento
        ) VALUES (
            v_empresa_id, p_plano_id, p_descricao, p_tolerancia_min, p_tolerancia_max, p_unidade, p_instrumento
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.industria_qualidade_plano_caracteristicas
           SET descricao = p_descricao,
               tolerancia_min = p_tolerancia_min,
               tolerancia_max = p_tolerancia_max,
               unidade = p_unidade,
               instrumento = p_instrumento,
               updated_at = now()
         WHERE id = v_id
           AND plano_id = p_plano_id
           AND empresa_id = v_empresa_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Característica não encontrada para atualização.';
        END IF;
    END IF;

    RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.qualidade_plano_delete_caracteristica(uuid);
CREATE OR REPLACE FUNCTION public.qualidade_plano_delete_caracteristica(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    DELETE FROM public.industria_qualidade_plano_caracteristicas
    WHERE id = p_id AND empresa_id = public.current_empresa_id();
END;
$$;

COMMIT;
