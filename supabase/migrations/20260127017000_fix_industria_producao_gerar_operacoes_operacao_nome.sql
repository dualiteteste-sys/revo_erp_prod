-- Fix: industria_producao_gerar_operacoes__unsafe referenciava campos inexistentes (operacao_nome/permite_overlap)
-- Sintoma: HTTP 400 "record r has no field operacao_nome" ao liberar OP.

BEGIN;

CREATE OR REPLACE FUNCTION public.industria_producao_gerar_operacoes__unsafe(p_ordem_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_roteiro_id uuid;
  v_qtd_planejada numeric;
  v_exists boolean;
  v_status text;
  r record;
BEGIN
  SELECT roteiro_aplicado_id, quantidade_planejada, status
    INTO v_roteiro_id, v_qtd_planejada, v_status
    FROM public.industria_producao_ordens
   WHERE id = p_ordem_id
     AND empresa_id = v_empresa_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
  END IF;

  IF v_status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Não é permitido gerar operações para uma ordem % (%).', p_ordem_id, v_status;
  END IF;

  IF v_roteiro_id IS NULL THEN
    RAISE EXCEPTION 'Ordem sem roteiro aplicado.';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.industria_producao_operacoes WHERE ordem_id = p_ordem_id)
    INTO v_exists;

  IF v_exists THEN
    RETURN; -- idempotente
  END IF;

  FOR r IN (
    SELECT
      e.sequencia,
      e.centro_trabalho_id,
      COALESCE(ct.nome, 'Centro não definido') AS centro_trabalho_nome,
      COALESCE(e.tipo_operacao, 'producao') AS tipo_operacao,
      COALESCE(e.permitir_overlap, false) AS permitir_overlap,
      COALESCE(e.tempo_setup_min, 0) AS tempo_setup_min,
      COALESCE(e.tempo_ciclo_min_por_unidade, 0) AS tempo_ciclo_min_por_unidade
    FROM public.industria_roteiros_etapas e
    LEFT JOIN public.industria_centros_trabalho ct ON ct.id = e.centro_trabalho_id
    WHERE e.roteiro_id = v_roteiro_id
      AND e.empresa_id = v_empresa_id
    ORDER BY e.sequencia
  ) LOOP
    INSERT INTO public.industria_producao_operacoes (
      empresa_id,
      ordem_id,
      sequencia,
      centro_trabalho_id,
      centro_trabalho_nome,
      tipo_operacao,
      permite_overlap,
      tempo_setup_min,
      tempo_ciclo_min_por_unidade,
      quantidade_planejada,
      status
    ) VALUES (
      v_empresa_id,
      p_ordem_id,
      r.sequencia,
      r.centro_trabalho_id,
      r.centro_trabalho_nome,
      r.tipo_operacao,
      r.permitir_overlap,
      r.tempo_setup_min,
      r.tempo_ciclo_min_por_unidade,
      v_qtd_planejada,
      'na_fila'
    );
  END LOOP;
END;
$function$;

-- Mantém o padrão do RBAC: apenas service_role/postgres pode executar o "__unsafe".
REVOKE ALL ON FUNCTION public.industria_producao_gerar_operacoes__unsafe(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.industria_producao_gerar_operacoes__unsafe(uuid) TO service_role, postgres;

COMMIT;

