-- =============================================================================
-- PCP Advanced Analytics: carga detalhada, Gantt enriquecido, KPIs, ATP/CTP e estoque projetado
-- =============================================================================

BEGIN;

-- 1) Update carga/capacidade function
DROP FUNCTION IF EXISTS public.pcp_carga_capacidade(date, date);
CREATE OR REPLACE FUNCTION public.pcp_carga_capacidade(p_data_inicial date DEFAULT NULL, p_data_final date DEFAULT NULL)
RETURNS TABLE (
    dia date,
    centro_trabalho_id uuid,
    centro_trabalho_nome text,
    capacidade_horas numeric,
    carga_total_horas numeric,
    carga_setup_horas numeric,
    carga_producao_horas numeric,
    carga_em_execucao_horas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_dt_ini date := COALESCE(p_data_inicial, now()::date - 3);
    v_dt_fim date := COALESCE(p_data_final, now()::date + 7);
BEGIN
    RETURN QUERY
    WITH periodo AS (
        SELECT generate_series(v_dt_ini, v_dt_fim, interval '1 day')::date AS dia
    ),
    centros AS (
        SELECT id, nome, COALESCE(capacidade_horas_dia, 8) AS capacidade_horas_dia
        FROM public.industria_centros_trabalho
        WHERE empresa_id = public.current_empresa_id()
          AND ativo = true
    ),
    carga AS (
        SELECT
            o.centro_trabalho_id,
            COALESCE(o.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date) AS dia_ref,
            COALESCE(o.tempo_setup_min, 0) / 60.0 AS carga_setup,
            (COALESCE(o.quantidade_planejada, 0) * COALESCE(o.tempo_ciclo_min_por_unidade, 0)) / 60.0 AS carga_producao,
            CASE WHEN o.status = 'em_execucao' THEN
                (COALESCE(o.tempo_setup_min, 0) + COALESCE(o.quantidade_planejada, 0) * COALESCE(o.tempo_ciclo_min_por_unidade, 0)) / 60.0
            ELSE 0 END AS carga_execucao
        FROM public.industria_producao_operacoes o
        JOIN public.industria_producao_ordens ord ON ord.id = o.ordem_id
        WHERE o.empresa_id = public.current_empresa_id()
          AND COALESCE(o.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date)
              BETWEEN v_dt_ini AND v_dt_fim
          AND o.centro_trabalho_id IS NOT NULL
    )
    SELECT
        p.dia,
        ct.id,
        ct.nome,
        ct.capacidade_horas_dia,
        COALESCE(SUM(c.carga_setup + c.carga_producao), 0) AS carga_total_horas,
        COALESCE(SUM(c.carga_setup), 0) AS carga_setup_horas,
        COALESCE(SUM(c.carga_producao), 0) AS carga_producao_horas,
        COALESCE(SUM(c.carga_execucao), 0) AS carga_em_execucao_horas
    FROM periodo p
    CROSS JOIN centros ct
    LEFT JOIN carga c ON c.centro_trabalho_id = ct.id AND c.dia_ref = p.dia
    GROUP BY p.dia, ct.id, ct.nome, ct.capacidade_horas_dia
    ORDER BY p.dia, ct.nome;
END;
$$;

-- 2) Update Gantt function
DROP FUNCTION IF EXISTS public.pcp_gantt_ordens(date, date);
CREATE OR REPLACE FUNCTION public.pcp_gantt_ordens(
    p_data_inicial date DEFAULT NULL,
    p_data_final date DEFAULT NULL
)
RETURNS TABLE (
    ordem_id uuid,
    ordem_numero integer,
    produto_nome text,
    status text,
    quantidade_planejada numeric,
    data_prevista_inicio date,
    data_prevista_fim date,
    operacao_id uuid,
    operacao_sequencia integer,
    centro_trabalho_id uuid,
    centro_trabalho_nome text,
    permite_overlap boolean,
    status_operacao text,
    data_inicio date,
    data_fim date,
    quantidade_transferida numeric,
    transfer_ratio numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_dt_ini date := COALESCE(p_data_inicial, now()::date - 7);
    v_dt_fim date := COALESCE(p_data_final, now()::date + 14);
BEGIN
    RETURN QUERY
    SELECT
        ord.id,
        ord.numero,
        prod.nome AS produto_nome,
        ord.status,
        ord.quantidade_planejada,
        ord.data_prevista_inicio,
        ord.data_prevista_fim,
        op.id,
        op.sequencia,
        op.centro_trabalho_id,
        op.centro_trabalho_nome,
        COALESCE(op.permite_overlap, false) AS permite_overlap,
        op.status,
        COALESCE(op.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date) AS data_inicio,
        COALESCE(op.data_fim_real::date, ord.data_prevista_fim, ord.data_prevista_inicio, now()::date) AS data_fim,
        COALESCE(op.quantidade_transferida, 0) AS quantidade_transferida,
        CASE
            WHEN COALESCE(op.quantidade_planejada, 0) = 0 THEN 0
            ELSE LEAST(op.quantidade_transferida / NULLIF(op.quantidade_planejada, 0), 1)
        END AS transfer_ratio
    FROM public.industria_producao_ordens ord
    JOIN public.produtos prod ON prod.id = ord.produto_final_id
    JOIN public.industria_producao_operacoes op ON op.ordem_id = ord.id
    WHERE ord.empresa_id = public.current_empresa_id()
      AND (
            COALESCE(ord.data_prevista_inicio, ord.created_at::date, now()::date) BETWEEN v_dt_ini AND v_dt_fim
         OR COALESCE(ord.data_prevista_fim, ord.data_prevista_inicio, ord.created_at::date, now()::date) BETWEEN v_dt_ini AND v_dt_fim
         OR COALESCE(op.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date) BETWEEN v_dt_ini AND v_dt_fim
          )
    ORDER BY ord.data_prevista_inicio NULLS LAST, ord.numero, op.sequencia;
END;
$$;

-- 3) KPIs
DROP FUNCTION IF EXISTS public.pcp_kpis_execucao(integer);
CREATE OR REPLACE FUNCTION public.pcp_kpis_execucao(p_periodo_dias integer DEFAULT 30)
RETURNS TABLE (
    periodo_dias integer,
    ordens_concluidas integer,
    otif_percent numeric,
    lead_time_planejado_horas numeric,
    lead_time_real_horas numeric,
    percentual_refugo numeric,
    aderencia_ciclo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_inicio timestamptz := now() - (COALESCE(p_periodo_dias, 30) || ' days')::interval;
BEGIN
    RETURN QUERY
    WITH ops AS (
        SELECT
            o.id AS ordem_id,
            MIN(op.data_inicio_real) AS inicio_real,
            MAX(op.data_fim_real) AS fim_real,
            SUM(COALESCE(op.quantidade_refugo, 0)) AS total_refugo,
            SUM(COALESCE(op.quantidade_produzida, 0)) AS total_boas
        FROM public.industria_producao_operacoes op
        JOIN public.industria_producao_ordens o ON o.id = op.ordem_id
        WHERE o.empresa_id = public.current_empresa_id()
          AND op.data_fim_real IS NOT NULL
          AND op.data_fim_real >= v_inicio
        GROUP BY o.id
    ),
    ord AS (
        SELECT
            o.*,
            ops.inicio_real,
            ops.fim_real,
            ops.total_refugo,
            ops.total_boas,
            CASE
                WHEN o.data_prevista_inicio IS NOT NULL AND o.data_prevista_fim IS NOT NULL THEN
                    EXTRACT(EPOCH FROM (o.data_prevista_fim::timestamptz - o.data_prevista_inicio::timestamptz)) / 3600.0
                WHEN o.data_prevista_inicio IS NOT NULL AND o.data_prevista_entrega IS NOT NULL THEN
                    EXTRACT(EPOCH FROM (o.data_prevista_entrega::timestamptz - o.data_prevista_inicio::timestamptz)) / 3600.0
                ELSE NULL
            END AS lead_plan_horas,
            CASE
                WHEN ops.inicio_real IS NOT NULL AND ops.fim_real IS NOT NULL THEN
                    EXTRACT(EPOCH FROM (ops.fim_real::timestamptz - ops.inicio_real::timestamptz)) / 3600.0
                ELSE NULL
            END AS lead_real_horas
        FROM public.industria_producao_ordens o
        JOIN ops ON ops.ordem_id = o.id
        WHERE o.empresa_id = public.current_empresa_id()
    ),
    stats AS (
        SELECT
            COUNT(*) AS total_ordens,
            SUM(CASE WHEN ord.data_prevista_entrega IS NOT NULL AND ord.fim_real::date <= ord.data_prevista_entrega THEN 1 ELSE 0 END) AS otif_ordens,
            AVG(ord.lead_plan_horas) AS avg_lead_plan,
            AVG(ord.lead_real_horas) AS avg_lead_real,
            SUM(ord.total_refugo) AS refugo_total,
            SUM(ord.total_refugo + ord.total_boas) AS total_produzido
        FROM ord
    )
    SELECT
        COALESCE(p_periodo_dias, 30)::integer AS periodo_dias,
        COALESCE(stats.total_ordens, 0)::integer AS ordens_concluidas,
        CASE WHEN stats.total_ordens > 0 THEN (stats.otif_ordens::numeric / stats.total_ordens) * 100 ELSE 0 END AS otif_percent,
        COALESCE(stats.avg_lead_plan, 0) AS lead_time_planejado_horas,
        COALESCE(stats.avg_lead_real, 0) AS lead_time_real_horas,
        CASE WHEN stats.total_produzido > 0 THEN (stats.refugo_total / stats.total_produzido) * 100 ELSE 0 END AS percentual_refugo,
        CASE WHEN COALESCE(stats.avg_lead_plan, 0) > 0 THEN stats.avg_lead_real / stats.avg_lead_plan ELSE 0 END AS aderencia_ciclo
    FROM stats;
END;
$$;

-- 4) ATP/CTP overview
DROP FUNCTION IF EXISTS public.pcp_atp_ctp_produtos(date);
CREATE OR REPLACE FUNCTION public.pcp_atp_ctp_produtos(p_data_final date DEFAULT NULL)
RETURNS TABLE (
    produto_id uuid,
    produto_nome text,
    estoque_atual numeric,
    em_producao numeric,
    demanda_confirmada numeric,
    disponibilidade_atp numeric,
    carga_horas_pendente numeric,
    capacidade_diaria_horas numeric,
    data_ctp date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_capacidade_diaria numeric;
    v_empresa_id uuid := public.current_empresa_id();
BEGIN
    SELECT COALESCE(SUM(capacidade_horas_dia), 0)
      INTO v_capacidade_diaria
      FROM public.industria_centros_trabalho
     WHERE empresa_id = v_empresa_id
       AND ativo = true;

    RETURN QUERY
    WITH estoque AS (
        SELECT el.produto_id, SUM(el.saldo) AS saldo
        FROM public.estoque_lotes el
        WHERE el.empresa_id = v_empresa_id
        GROUP BY el.produto_id
    ),
    entregas AS (
        SELECT ordem_id, SUM(quantidade_entregue) AS total_entregue
        FROM public.industria_producao_entregas
        WHERE empresa_id = v_empresa_id
        GROUP BY ordem_id
    ),
    carga_ops AS (
        SELECT
            o.ordem_id,
            SUM(COALESCE(o.tempo_setup_min, 0) + COALESCE(o.quantidade_planejada, 0) * COALESCE(o.tempo_ciclo_min_por_unidade, 0)) / 60.0 AS carga_horas
        FROM public.industria_producao_operacoes o
        WHERE o.empresa_id = v_empresa_id
          AND o.status <> 'concluida'
        GROUP BY o.ordem_id
    ),
    ordens AS (
        SELECT
            o.produto_final_id AS ord_produto_id,
            prod.nome AS produto_nome,
            SUM(CASE WHEN o.status = 'em_producao' THEN COALESCE(o.quantidade_planejada, 0) - COALESCE(e.total_entregue, 0) ELSE 0 END) AS em_producao,
            SUM(CASE WHEN o.status NOT IN ('concluida', 'cancelada') THEN COALESCE(o.quantidade_planejada, 0) ELSE 0 END) AS demanda_confirmada,
            SUM(COALESCE(carga_ops.carga_horas, 0)) AS carga_horas_pendente
        FROM public.industria_producao_ordens o
        JOIN public.produtos prod ON prod.id = o.produto_final_id
        LEFT JOIN entregas e ON e.ordem_id = o.id
        LEFT JOIN carga_ops ON carga_ops.ordem_id = o.id
        WHERE o.empresa_id = v_empresa_id
        GROUP BY ord_produto_id, prod.nome
    )
    SELECT
        ordens.ord_produto_id AS produto_id,
        ordens.produto_nome,
        COALESCE(estoque.saldo, 0) AS estoque_atual,
        COALESCE(ordens.em_producao, 0) AS em_producao,
        COALESCE(ordens.demanda_confirmada, 0) AS demanda_confirmada,
        COALESCE(estoque.saldo, 0) + COALESCE(ordens.em_producao, 0) - COALESCE(ordens.demanda_confirmada, 0) AS disponibilidade_atp,
        COALESCE(ordens.carga_horas_pendente, 0) AS carga_horas_pendente,
        v_capacidade_diaria AS capacidade_diaria_horas,
        CASE
            WHEN v_capacidade_diaria > 0 AND COALESCE(ordens.carga_horas_pendente, 0) > 0 THEN
                (now()::date + CEIL(COALESCE(ordens.carga_horas_pendente, 0) / v_capacidade_diaria)::integer)
            ELSE NULL
        END AS data_ctp
    FROM ordens
    LEFT JOIN estoque ON estoque.produto_id = ordens.ord_produto_id;
END;
$$;

-- 5) Estoque projetado
DROP FUNCTION IF EXISTS public.pcp_estoque_projetado(uuid, integer);
CREATE OR REPLACE FUNCTION public.pcp_estoque_projetado(
    p_produto_id uuid,
    p_dias integer DEFAULT 30
)
RETURNS TABLE (
    dia date,
    saldo_projetado numeric,
    producao_prevista numeric,
    entregas_previstas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_saldo_base numeric := 0;
BEGIN
    IF p_produto_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(saldo), 0)
      INTO v_saldo_base
      FROM public.estoque_lotes
     WHERE empresa_id = v_empresa_id
       AND produto_id = p_produto_id;

    RETURN QUERY
    WITH periodo AS (
        SELECT generate_series(now()::date, now()::date + COALESCE(p_dias, 30), interval '1 day')::date AS dia
    ),
    producoes AS (
        SELECT
            COALESCE(op.data_fim_real::date, o.data_prevista_fim, o.data_prevista_inicio, now()::date) AS dia,
            COALESCE(op.quantidade_produzida, o.quantidade_planejada) AS quantidade
        FROM public.industria_producao_ordens o
        LEFT JOIN public.industria_producao_operacoes op
          ON op.ordem_id = o.id
         AND op.sequencia = (
             SELECT MAX(op2.sequencia)
             FROM public.industria_producao_operacoes op2
             WHERE op2.ordem_id = o.id
         )
        WHERE o.empresa_id = v_empresa_id
          AND o.produto_final_id = p_produto_id
    ),
    entregas AS (
        SELECT
            COALESCE(data_entrega, now()::date) AS dia,
            quantidade_entregue
        FROM public.industria_producao_entregas
        WHERE empresa_id = v_empresa_id
          AND ordem_id IN (
              SELECT id FROM public.industria_producao_ordens
              WHERE empresa_id = v_empresa_id AND produto_final_id = p_produto_id
          )
    )
    SELECT
        p.dia,
        v_saldo_base
        + COALESCE((SELECT SUM(prod.quantidade) FROM producoes prod WHERE prod.dia <= p.dia), 0)
        - COALESCE((SELECT SUM(ent.quantidade_entregue) FROM entregas ent WHERE ent.dia <= p.dia), 0) AS saldo_projetado,
        COALESCE((SELECT SUM(prod.quantidade) FROM producoes prod WHERE prod.dia = p.dia), 0) AS producao_prevista,
        COALESCE((SELECT SUM(ent.quantidade_entregue) FROM entregas ent WHERE ent.dia = p.dia), 0) AS entregas_previstas
    FROM periodo p
    ORDER BY p.dia;
END;
$$;

COMMIT;
