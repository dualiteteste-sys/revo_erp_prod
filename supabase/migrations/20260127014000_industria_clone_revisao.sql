-- =============================================================================
-- Indústria: Revisão pós-liberação (clonar ordem)
-- - Estende industria_clone_ordem para copiar roteiro aplicado
-- - Adiciona industria_producao_clone_ordem para OP (produção)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- OP/OB (industria_ordens): clone + copia roteiro aplicado
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_clone_ordem(uuid);

CREATE OR REPLACE FUNCTION public.industria_clone_ordem(p_source_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_src record;
  v_new_id uuid;
BEGIN
  SELECT *
    INTO v_src
    FROM public.industria_ordens o
   WHERE o.id = p_source_id
     AND o.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.';
  END IF;

  INSERT INTO public.industria_ordens (
    empresa_id,
    tipo_ordem,
    produto_final_id,
    quantidade_planejada,
    unidade,
    cliente_id,
    status,
    prioridade,
    data_prevista_inicio,
    data_prevista_fim,
    data_prevista_entrega,
    documento_ref,
    observacoes,
    usa_material_cliente,
    material_cliente_id,
    roteiro_aplicado_id,
    roteiro_aplicado_desc
  ) VALUES (
    v_empresa_id,
    v_src.tipo_ordem,
    v_src.produto_final_id,
    v_src.quantidade_planejada,
    v_src.unidade,
    v_src.cliente_id,
    'rascunho',
    0,
    NULL,
    NULL,
    NULL,
    CASE
      WHEN v_src.documento_ref IS NULL OR btrim(v_src.documento_ref) = '' THEN
        CASE WHEN v_src.numero IS NOT NULL THEN 'Revisão da ordem ' || v_src.numero::text ELSE 'Revisão de ordem' END
      ELSE
        '[REVISÃO] ' || v_src.documento_ref
    END,
    v_src.observacoes,
    COALESCE(v_src.usa_material_cliente, false),
    v_src.material_cliente_id,
    v_src.roteiro_aplicado_id,
    v_src.roteiro_aplicado_desc
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.industria_ordens_componentes (
    empresa_id,
    ordem_id,
    produto_id,
    quantidade_planejada,
    unidade,
    origem
  )
  SELECT
    v_empresa_id,
    v_new_id,
    c.produto_id,
    c.quantidade_planejada,
    c.unidade,
    c.origem
  FROM public.industria_ordens_componentes c
  WHERE c.ordem_id = p_source_id
    AND c.empresa_id = v_empresa_id;

  RETURN public.industria_get_ordem_details(v_new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.industria_clone_ordem(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.industria_clone_ordem(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OP (produção): clone para revisão sem operações/entregas
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_producao_clone_ordem(uuid);

CREATE OR REPLACE FUNCTION public.industria_producao_clone_ordem(p_source_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_src record;
  v_new_id uuid;
BEGIN
  SELECT *
    INTO v_src
    FROM public.industria_producao_ordens o
   WHERE o.id = p_source_id
     AND o.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OP não encontrada.';
  END IF;

  INSERT INTO public.industria_producao_ordens (
    empresa_id,
    origem_ordem,
    produto_final_id,
    quantidade_planejada,
    unidade,
    status,
    prioridade,
    data_prevista_inicio,
    data_prevista_fim,
    data_prevista_entrega,
    documento_ref,
    observacoes,
    roteiro_aplicado_id,
    roteiro_aplicado_desc,
    bom_aplicado_id,
    bom_aplicado_desc,
    lote_producao,
    reserva_modo,
    tolerancia_overrun_percent
  ) VALUES (
    v_empresa_id,
    COALESCE(v_src.origem_ordem, 'manual'),
    v_src.produto_final_id,
    v_src.quantidade_planejada,
    v_src.unidade,
    'rascunho',
    0,
    NULL,
    NULL,
    NULL,
    CASE
      WHEN v_src.documento_ref IS NULL OR btrim(v_src.documento_ref) = '' THEN
        CASE WHEN v_src.numero IS NOT NULL THEN 'Revisão OP ' || v_src.numero::text ELSE 'Revisão OP' END
      ELSE
        '[REVISÃO] ' || v_src.documento_ref
    END,
    v_src.observacoes,
    v_src.roteiro_aplicado_id,
    v_src.roteiro_aplicado_desc,
    v_src.bom_aplicado_id,
    v_src.bom_aplicado_desc,
    NULL,
    COALESCE(v_src.reserva_modo, 'ao_liberar'),
    COALESCE(v_src.tolerancia_overrun_percent, 0)
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.industria_producao_componentes (
    empresa_id,
    ordem_id,
    produto_id,
    quantidade_planejada,
    unidade,
    origem
  )
  SELECT
    v_empresa_id,
    v_new_id,
    c.produto_id,
    c.quantidade_planejada,
    c.unidade,
    c.origem
  FROM public.industria_producao_componentes c
  WHERE c.ordem_id = p_source_id
    AND c.empresa_id = v_empresa_id;

  RETURN public.industria_producao_get_ordem_details(v_new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.industria_producao_clone_ordem(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.industria_producao_clone_ordem(uuid) TO authenticated, service_role;

COMMIT;

