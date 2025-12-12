-- =============================================================================
-- Hook industria_producao_manage_componente into the MRP demand engine
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.industria_producao_manage_componente(
  p_ordem_id             uuid,
  p_componente_id        uuid,
  p_produto_id           uuid,
  p_quantidade_planejada numeric,
  p_unidade              text,
  p_action               text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_target_id uuid := p_componente_id;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.industria_producao_ordens o
     WHERE o.id = p_ordem_id
       AND o.empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Ordem não encontrada.';
  END IF;

  IF p_action = 'delete' THEN
    DELETE FROM public.industria_producao_componentes
     WHERE id = p_componente_id
       AND empresa_id = v_empresa_id;

    DELETE FROM public.industria_mrp_demandas
     WHERE empresa_id = v_empresa_id
       AND componente_id = p_componente_id;
    RETURN;
  END IF;

  IF v_target_id IS NOT NULL THEN
    UPDATE public.industria_producao_componentes
       SET produto_id = p_produto_id,
           quantidade_planejada = p_quantidade_planejada,
           unidade = p_unidade,
           updated_at = now()
     WHERE id = v_target_id
       AND empresa_id = v_empresa_id
     RETURNING id INTO v_target_id;
  ELSE
    INSERT INTO public.industria_producao_componentes (
      empresa_id,
      ordem_id,
      produto_id,
      quantidade_planejada,
      unidade
    ) VALUES (
      v_empresa_id,
      p_ordem_id,
      p_produto_id,
      p_quantidade_planejada,
      p_unidade
    )
    RETURNING id INTO v_target_id;
  END IF;

  PERFORM public.mrp_sync_demanda_componente(v_target_id, 'bom');
END;
$$;

COMMIT;
