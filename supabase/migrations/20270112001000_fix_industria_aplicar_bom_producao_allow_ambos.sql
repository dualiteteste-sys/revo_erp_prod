-- =============================================================================
-- Fix: aplicar BOM em Ordem de Produção deve aceitar BOMs do tipo 'ambos'
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.industria_aplicar_bom_em_ordem_producao__unsafe(
  p_bom_id uuid,
  p_ordem_id uuid,
  p_modo text DEFAULT 'substituir'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_empresa_id          uuid   := public.current_empresa_id();
  v_produto_bom         uuid;
  v_produto_ordem       uuid;
  v_qtd_planejada_ordem numeric;
BEGIN
  -- Valida BOM (Produção ou Ambos)
  SELECT b.produto_final_id
    INTO v_produto_bom
    FROM public.industria_boms b
   WHERE b.id = p_bom_id
     AND b.empresa_id = v_empresa_id
     AND b.tipo_bom IN ('producao', 'ambos');

  IF v_produto_bom IS NULL THEN
    RAISE EXCEPTION 'BOM não encontrada, não pertence à empresa atual ou não é compatível com produção.';
  END IF;

  -- Valida Ordem de Produção
  SELECT o.produto_final_id, o.quantidade_planejada
    INTO v_produto_ordem, v_qtd_planejada_ordem
    FROM public.industria_producao_ordens o
   WHERE o.id = p_ordem_id
     AND o.empresa_id = v_empresa_id;

  IF v_produto_ordem IS NULL THEN
    RAISE EXCEPTION 'Ordem de produção não encontrada ou acesso negado.';
  END IF;

  IF v_produto_bom <> v_produto_ordem THEN
    RAISE EXCEPTION 'Produto da BOM difere do produto da ordem de produção.';
  END IF;

  IF v_qtd_planejada_ordem IS NULL OR v_qtd_planejada_ordem <= 0 THEN
    RAISE EXCEPTION 'Quantidade planejada da ordem de produção inválida.';
  END IF;

  -- Modo: substituir → remove componentes de origem bom_padrao
  IF p_modo = 'substituir' THEN
    DELETE FROM public.industria_producao_componentes c
     WHERE c.empresa_id = v_empresa_id
       AND c.ordem_id   = p_ordem_id
       AND c.origem     = 'bom_padrao';
  ELSIF p_modo <> 'adicionar' THEN
    RAISE EXCEPTION 'Modo inválido. Use ''substituir'' ou ''adicionar''.';
  END IF;

  -- Insere componentes calculados a partir da BOM
  INSERT INTO public.industria_producao_componentes (
    empresa_id,
    ordem_id,
    produto_id,
    quantidade_planejada,
    quantidade_consumida,
    unidade,
    origem
  )
  SELECT
    v_empresa_id,
    p_ordem_id,
    c.produto_id,
    c.quantidade * v_qtd_planejada_ordem,
    0::numeric,
    c.unidade,
    'bom_padrao'
  FROM public.industria_boms_componentes c
  WHERE c.bom_id     = p_bom_id
    AND c.empresa_id = v_empresa_id;

  PERFORM pg_notify(
    'app_log',
    '[RPC] industria_aplicar_bom_em_ordem_producao: bom=' || p_bom_id || ' ordem=' || p_ordem_id
  );
END;
$$;

COMMIT;

