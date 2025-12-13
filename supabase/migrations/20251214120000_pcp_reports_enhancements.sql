-- =============================================================================
-- PCP Reporting Enhancements: pareto de refugos e lead times por OP
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.pcp_pareto_refugos(date, date);
CREATE OR REPLACE FUNCTION public.pcp_pareto_refugos(
    p_data_inicial date DEFAULT NULL,
    p_data_final date DEFAULT NULL
)
RETURNS TABLE (
    motivo_id uuid,
    motivo_nome text,
    centro_trabalho_id uuid,
    centro_trabalho_nome text,
    total_refugo numeric,
    percentual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_dt_ini date := COALESCE(p_data_inicial, now()::date - 30);
    v_dt_fim date := COALESCE(p_data_final, now()::date);
BEGIN
    RETURN QUERY
    WITH refugos AS (
        SELECT
            COALESCE(ap.motivo_refugo_id, '00000000-0000-0000-0000-000000000000'::uuid) AS motivo_id,
            COALESCE(m.descricao, ap.motivo_refugo, 'Sem motivo informado') AS motivo_nome,
            op.centro_trabalho_id,
            op.centro_trabalho_nome,
            SUM(COALESCE(ap.quantidade_refugo, 0)) AS total_refugo
        FROM public.industria_producao_apontamentos ap
        JOIN public.industria_producao_operacoes op ON op.id = ap.operacao_id
        LEFT JOIN public.industria_qualidade_motivos m ON m.id = ap.motivo_refugo_id
        WHERE ap.empresa_id = v_empresa_id
          AND ap.data_apontamento::date BETWEEN v_dt_ini AND v_dt_fim
        GROUP BY 1, 2, 3, 4
    ),
    soma AS (
        SELECT SUM(refugos.total_refugo) AS total FROM refugos
    )
    SELECT
        refugos.motivo_id,
        refugos.motivo_nome,
        refugos.centro_trabalho_id,
        refugos.centro_trabalho_nome,
        refugos.total_refugo,
        CASE WHEN soma.total > 0 THEN (refugos.total_refugo / soma.total) * 100 ELSE 0 END AS percentual
    FROM refugos
    CROSS JOIN soma
    ORDER BY refugos.total_refugo DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.pcp_ordens_lead_time(date, date);
CREATE OR REPLACE FUNCTION public.pcp_ordens_lead_time(
    p_data_inicial date DEFAULT NULL,
    p_data_final date DEFAULT NULL
)
RETURNS TABLE (
    ordem_id uuid,
    ordem_numero integer,
    produto_nome text,
    status text,
    data_prevista_inicio date,
    data_prevista_fim date,
    data_fim_real date,
    lead_time_planejado_horas numeric,
    lead_time_real_horas numeric,
    atraso_horas numeric,
    cumpriu_prazo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_dt_ini date := COALESCE(p_data_inicial, now()::date - 30);
    v_dt_fim date := COALESCE(p_data_final, now()::date);
BEGIN
    RETURN QUERY
    WITH ops AS (
        SELECT
            o.id AS ordem_id,
            MIN(op.data_inicio_real) AS inicio_real,
            MAX(op.data_fim_real) AS fim_real
        FROM public.industria_producao_operacoes op
        JOIN public.industria_producao_ordens o ON o.id = op.ordem_id
        WHERE o.empresa_id = v_empresa_id
        GROUP BY o.id
    ),
    ordens AS (
        SELECT
            o.id,
            o.numero,
            prod.nome AS produto_nome,
            o.status,
            o.data_prevista_inicio,
            o.data_prevista_fim,
            ops.fim_real,
            CASE
                WHEN o.data_prevista_inicio IS NOT NULL AND o.data_prevista_fim IS NOT NULL THEN
                    EXTRACT(EPOCH FROM (o.data_prevista_fim::timestamptz - o.data_prevista_inicio::timestamptz)) / 3600.0
                ELSE NULL
            END AS lead_planejado,
            CASE
                WHEN ops.inicio_real IS NOT NULL AND ops.fim_real IS NOT NULL THEN
                    EXTRACT(EPOCH FROM (ops.fim_real - ops.inicio_real)) / 3600.0
                ELSE NULL
            END AS lead_real
        FROM public.industria_producao_ordens o
        LEFT JOIN ops ON ops.ordem_id = o.id
        JOIN public.produtos prod ON prod.id = o.produto_final_id
        WHERE o.empresa_id = v_empresa_id
          AND (
                o.data_prevista_inicio BETWEEN v_dt_ini AND v_dt_fim
                OR o.data_prevista_fim BETWEEN v_dt_ini AND v_dt_fim
                OR ops.fim_real::date BETWEEN v_dt_ini AND v_dt_fim
          )
    )
    SELECT
        ordens.id,
        ordens.numero,
        ordens.produto_nome,
        ordens.status,
        ordens.data_prevista_inicio,
        ordens.data_prevista_fim,
        ordens.fim_real::date,
        COALESCE(ordens.lead_planejado, 0) AS lead_time_planejado_horas,
        COALESCE(ordens.lead_real, 0) AS lead_time_real_horas,
        COALESCE(ordens.lead_real, 0) - COALESCE(ordens.lead_planejado, 0) AS atraso_horas,
        CASE
            WHEN ordens.lead_planejado IS NULL OR ordens.lead_real IS NULL THEN NULL
            WHEN ordens.lead_real <= ordens.lead_planejado THEN TRUE
            ELSE FALSE
        END AS cumpriu_prazo
    FROM ordens
    ORDER BY ordens.data_prevista_inicio NULLS LAST, ordens.numero;
END;
$$;

COMMIT;
