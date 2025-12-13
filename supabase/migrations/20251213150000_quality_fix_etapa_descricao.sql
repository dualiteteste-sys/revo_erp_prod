-- ============================================================================
-- QA hotfix: ensure etapa name fields pull from descricao instead of observacoes
-- ============================================================================

BEGIN;

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
              AND c.empresa_id = public.current_empresa_id()
        ), '[]'::jsonb) AS caracteristicas
    FROM public.industria_qualidade_planos p
    JOIN public.produtos prod ON prod.id = p.produto_id
    LEFT JOIN public.industria_roteiros r ON r.id = p.roteiro_id
    LEFT JOIN public.industria_roteiros_etapas e ON e.id = p.roteiro_etapa_id
    WHERE p.empresa_id = public.current_empresa_id()
      AND p.id = p_id;
$$;

COMMIT;
