-- =============================================================================
-- Indústria (OP/OB): persistir referência de BOM aplicada na ordem unificada
-- - Adiciona colunas bom_aplicado_id/bom_aplicado_desc em public.industria_ordens
-- - Ajusta RPC de aplicar BOM em beneficiamento para preencher descrição com versão
-- =============================================================================

BEGIN;

ALTER TABLE public.industria_ordens
  ADD COLUMN IF NOT EXISTS bom_aplicado_id uuid,
  ADD COLUMN IF NOT EXISTS bom_aplicado_desc text;

-- Recria RPC para registrar referência no cabeçalho (com versão) e manter componentes.
CREATE OR REPLACE FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento__unsafe(
  p_bom_id uuid,
  p_ordem_id uuid,
  p_modo text DEFAULT 'substituir'  -- 'substituir' | 'adicionar'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id          uuid := public.current_empresa_id();
  v_produto_bom         uuid;
  v_produto_ordem       uuid;
  v_qtd_planejada_ordem numeric;
  v_bom_codigo          text;
  v_bom_desc            text;
  v_bom_versao          int;
  v_bom_label           text;
BEGIN
  SELECT b.produto_final_id, b.codigo, b.descricao, b.versao
    INTO v_produto_bom, v_bom_codigo, v_bom_desc, v_bom_versao
    FROM public.industria_boms b
   WHERE b.id = p_bom_id
     AND b.empresa_id = v_empresa_id
     AND b.tipo_bom IN ('beneficiamento', 'ambos');

  IF v_produto_bom IS NULL THEN
    RAISE EXCEPTION 'BOM não encontrada, não pertence à empresa atual ou não é compatível com beneficiamento.';
  END IF;

  SELECT o.produto_final_id, o.quantidade_planejada
    INTO v_produto_ordem, v_qtd_planejada_ordem
    FROM public.industria_ordens o
   WHERE o.id = p_ordem_id
     AND o.empresa_id = v_empresa_id
     AND o.tipo_ordem = 'beneficiamento';

  IF v_produto_ordem IS NULL THEN
    RAISE EXCEPTION 'Ordem de beneficiamento não encontrada ou acesso negado.';
  END IF;

  IF v_produto_bom <> v_produto_ordem THEN
    RAISE EXCEPTION 'Produto da BOM difere do produto da ordem de beneficiamento.';
  END IF;

  IF v_qtd_planejada_ordem IS NULL OR v_qtd_planejada_ordem <= 0 THEN
    RAISE EXCEPTION 'Quantidade planejada da ordem de beneficiamento inválida.';
  END IF;

  IF p_modo = 'substituir' THEN
    DELETE FROM public.industria_ordens_componentes c
     WHERE c.empresa_id = v_empresa_id
       AND c.ordem_id   = p_ordem_id
       AND c.origem     = 'bom_padrao';
  ELSIF p_modo <> 'adicionar' THEN
    RAISE EXCEPTION 'Modo inválido. Use ''substituir'' ou ''adicionar''.';
  END IF;

  INSERT INTO public.industria_ordens_componentes (
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
  WHERE c.bom_id = p_bom_id
    AND c.empresa_id = v_empresa_id;

  v_bom_label := CASE
    WHEN v_bom_codigo IS NOT NULL AND btrim(v_bom_codigo) <> '' AND v_bom_versao IS NOT NULL THEN v_bom_codigo || ' (v' || v_bom_versao::text || ')'
    WHEN v_bom_codigo IS NOT NULL AND btrim(v_bom_codigo) <> '' THEN v_bom_codigo
    WHEN v_bom_desc IS NOT NULL AND btrim(v_bom_desc) <> '' THEN v_bom_desc
    ELSE NULL
  END;

  UPDATE public.industria_ordens
     SET bom_aplicado_id = p_bom_id,
         bom_aplicado_desc = COALESCE(v_bom_label, bom_aplicado_desc)
   WHERE id = p_ordem_id
     AND empresa_id = v_empresa_id;

  PERFORM pg_notify(
    'app_log',
    '[RPC] industria_aplicar_bom_em_ordem_beneficiamento: bom=' || p_bom_id || ' ordem=' || p_ordem_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento(
  p_bom_id uuid,
  p_ordem_id uuid,
  p_modo text DEFAULT 'substituir'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_empresa_role_at_least('member');
  PERFORM public.industria_aplicar_bom_em_ordem_beneficiamento__unsafe(p_bom_id, p_ordem_id, p_modo);
END;
$$;

REVOKE ALL ON FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento__unsafe(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento__unsafe(uuid, uuid, text) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento(uuid, uuid, text) TO authenticated, service_role;

COMMIT;

