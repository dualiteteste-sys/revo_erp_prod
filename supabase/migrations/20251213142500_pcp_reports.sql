-- =============================================================================
-- PCP dashboards: capacity fields + RPCs for carga/capacidade e Gantt
-- =============================================================================

BEGIN;

ALTER TABLE public.industria_centros_trabalho
    ADD COLUMN IF NOT EXISTS capacidade_horas_dia numeric DEFAULT 8;

DROP FUNCTION IF EXISTS public.industria_centros_trabalho_list(text, boolean);
CREATE OR REPLACE FUNCTION public.industria_centros_trabalho_list(p_search text DEFAULT NULL::text, p_ativo boolean DEFAULT NULL::boolean)
 RETURNS TABLE(
    id uuid,
    nome text,
    codigo text,
    descricao text,
    ativo boolean,
    capacidade_unidade_hora numeric,
    capacidade_horas_dia numeric,
    tipo_uso text,
    tempo_setup_min integer,
    requer_inspecao_final boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.nome,
    c.codigo,
    c.descricao,
    c.ativo,
    c.capacidade_unidade_hora,
    c.capacidade_horas_dia,
    c.tipo_uso,
    c.tempo_setup_min,
    c.requer_inspecao_final
  FROM public.industria_centros_trabalho c
  WHERE c.empresa_id = v_empresa_id
    AND (p_ativo IS NULL OR c.ativo = p_ativo)
    AND (
      p_search IS NULL
      OR c.nome   ILIKE '%' || p_search || '%'
      OR c.codigo ILIKE '%' || p_search || '%'
    )
  ORDER BY
    c.ativo DESC,
    c.nome ASC;
END;
$function$;

DROP FUNCTION IF EXISTS public.industria_centros_trabalho_upsert(jsonb);
CREATE OR REPLACE FUNCTION public.industria_centros_trabalho_upsert(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_id         uuid;
  v_result     jsonb;
BEGIN
  IF p_payload->>'nome' IS NULL OR trim(p_payload->>'nome') = '' THEN
    RAISE EXCEPTION 'Nome do centro de trabalho é obrigatório.';
  END IF;

  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.industria_centros_trabalho
       SET nome                    = p_payload->>'nome',
           codigo                  = p_payload->>'codigo',
           descricao               = p_payload->>'descricao',
           ativo                   = COALESCE((p_payload->>'ativo')::boolean, true),
           capacidade_unidade_hora = (p_payload->>'capacidade_unidade_hora')::numeric,
           capacidade_horas_dia    = COALESCE((p_payload->>'capacidade_horas_dia')::numeric, capacidade_horas_dia),
           tipo_uso                = COALESCE(p_payload->>'tipo_uso', 'ambos'),
           tempo_setup_min         = COALESCE((p_payload->>'tempo_setup_min')::integer, 0),
           requer_inspecao_final   = COALESCE((p_payload->>'requer_inspecao_final')::boolean, false),
           updated_at              = now()
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id
     RETURNING id INTO v_id;
    
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Centro de trabalho não encontrado ou acesso negado.';
    END IF;

  ELSE
    INSERT INTO public.industria_centros_trabalho (
      empresa_id,
      nome,
      codigo,
      descricao,
      ativo,
      capacidade_unidade_hora,
      capacidade_horas_dia,
      tipo_uso,
      tempo_setup_min,
      requer_inspecao_final
    ) VALUES (
      v_empresa_id,
      p_payload->>'nome',
      p_payload->>'codigo',
      p_payload->>'descricao',
      COALESCE((p_payload->>'ativo')::boolean, true),
      (p_payload->>'capacidade_unidade_hora')::numeric,
      COALESCE((p_payload->>'capacidade_horas_dia')::numeric, 8),
      COALESCE(p_payload->>'tipo_uso', 'ambos'),
      COALESCE((p_payload->>'tempo_setup_min')::integer, 0),
      COALESCE((p_payload->>'requer_inspecao_final')::boolean, false)
    )
    RETURNING id INTO v_id;
  END IF;

  SELECT jsonb_build_object(
    'id', c.id,
    'nome', c.nome,
    'codigo', c.codigo,
    'descricao', c.descricao,
    'ativo', c.ativo,
    'capacidade_unidade_hora', c.capacidade_unidade_hora,
    'capacidade_horas_dia', c.capacidade_horas_dia,
    'tipo_uso', c.tipo_uso,
    'tempo_setup_min', c.tempo_setup_min,
    'requer_inspecao_final', c.requer_inspecao_final
  )
  INTO v_result
  FROM public.industria_centros_trabalho c
  WHERE c.id = v_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pcp_carga_capacidade(
    p_data_inicial date DEFAULT NULL,
    p_data_final date DEFAULT NULL
)
RETURNS TABLE (
    dia date,
    centro_trabalho_id uuid,
    centro_trabalho_nome text,
    capacidade_horas numeric,
    carga_planejada_horas numeric,
    carga_em_execucao_horas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_dt_ini date := COALESCE(p_data_inicial, (now()::date - 3));
    v_dt_fim date := COALESCE(p_data_final, (now()::date + 7));
BEGIN
    RETURN QUERY
    WITH empresas AS (
        SELECT public.current_empresa_id() AS empresa_id
    ),
    periodo AS (
        SELECT generate_series(v_dt_ini, v_dt_fim, interval '1 day')::date AS dia
    ),
    centros AS (
        SELECT c.id, c.nome, COALESCE(c.capacidade_horas_dia, 8) AS capacidade_horas_dia
        FROM public.industria_centros_trabalho c
        JOIN empresas e ON e.empresa_id = c.empresa_id
        WHERE c.ativo = true
    ),
    carga AS (
        SELECT
            o.centro_trabalho_id,
            COALESCE(o.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date) AS dia_ref,
            (COALESCE(o.tempo_setup_min, 0) + COALESCE(o.quantidade_planejada,0) * COALESCE(o.tempo_ciclo_min_por_unidade,0)) / 60.0 AS carga_planejada,
            CASE WHEN o.status = 'em_execucao' THEN
                (COALESCE(o.tempo_setup_min, 0) + COALESCE(o.quantidade_planejada,0) * COALESCE(o.tempo_ciclo_min_por_unidade,0)) / 60.0
            ELSE 0 END AS carga_execucao
        FROM public.industria_producao_operacoes o
        JOIN public.industria_producao_ordens ord ON ord.id = o.ordem_id
        JOIN empresas e ON e.empresa_id = o.empresa_id
        WHERE COALESCE(o.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date)
              BETWEEN v_dt_ini AND v_dt_fim
          AND o.centro_trabalho_id IS NOT NULL
    )
    SELECT
        p.dia,
        ct.id AS centro_trabalho_id,
        ct.nome AS centro_trabalho_nome,
        ct.capacidade_horas_dia AS capacidade_horas,
        COALESCE(SUM(c.carga_planejada), 0) AS carga_planejada_horas,
        COALESCE(SUM(c.carga_execucao), 0) AS carga_em_execucao_horas
    FROM periodo p
    CROSS JOIN centros ct
    LEFT JOIN carga c ON c.centro_trabalho_id = ct.id AND c.dia_ref = p.dia
    GROUP BY p.dia, ct.id, ct.nome, ct.capacidade_horas_dia
    ORDER BY p.dia, ct.nome;
END;
$$;

CREATE OR REPLACE FUNCTION public.pcp_gantt_ordens(
    p_data_inicial date DEFAULT NULL,
    p_data_final date DEFAULT NULL
)
RETURNS TABLE (
    ordem_id uuid,
    ordem_numero bigint,
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
    quantidade_transferida numeric
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
        ord.produto_nome,
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
        COALESCE(op.quantidade_transferida, 0) AS quantidade_transferida
    FROM public.industria_producao_ordens ord
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

COMMIT;
