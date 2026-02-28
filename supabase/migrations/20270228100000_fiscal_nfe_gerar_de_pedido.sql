-- Sprint 1: Auto-generate NF-e draft from a completed sales order
-- + Add danfe_url / xml_url columns for Focus NFe download links
-- + Add pedido_origem_id to link NF-e back to sales order

BEGIN;

-- ============================================================
-- 1. Add origin link: fiscal_nfe_emissoes → vendas_pedidos
-- ============================================================
ALTER TABLE public.fiscal_nfe_emissoes
  ADD COLUMN IF NOT EXISTS pedido_origem_id uuid REFERENCES public.vendas_pedidos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_nfe_emissoes_pedido_origem
  ON public.fiscal_nfe_emissoes (empresa_id, pedido_origem_id)
  WHERE pedido_origem_id IS NOT NULL;

-- ============================================================
-- 2. Add DANFE / XML URL fields to nfeio_emissoes
-- ============================================================
ALTER TABLE public.fiscal_nfe_nfeio_emissoes
  ADD COLUMN IF NOT EXISTS danfe_url text,
  ADD COLUMN IF NOT EXISTS xml_url text;

-- ============================================================
-- 3. RPC: fiscal_nfe_gerar_de_pedido
--    Reads a concluded sales order → creates an NF-e draft
-- ============================================================
CREATE OR REPLACE FUNCTION public.fiscal_nfe_gerar_de_pedido(
  p_pedido_id uuid,
  p_ambiente text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa    uuid := public.current_empresa_id();
  v_pedido     record;
  v_item       record;
  v_emitente   record;
  v_ambiente   text;
  v_existing   uuid;
  v_emissao_id uuid;
  v_items      jsonb := '[]'::jsonb;
  v_item_obj   jsonb;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  -- Require at least member role (not admin-only — sales team needs this)
  PERFORM public.assert_empresa_role_at_least('member');

  -- ─── Read the sales order ────────────────────────────────
  SELECT
    p.id,
    p.numero,
    p.cliente_id,
    p.status,
    p.total_produtos,
    p.frete,
    p.desconto,
    p.total_geral,
    pe.nome AS cliente_nome,
    pe.doc_unico AS cliente_doc
  INTO v_pedido
  FROM public.vendas_pedidos p
  LEFT JOIN public.pessoas pe ON pe.id = p.cliente_id
  WHERE p.id = p_pedido_id
    AND p.empresa_id = v_empresa;

  IF v_pedido IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING errcode = 'P0001';
  END IF;

  -- Only allow from approved or concluded orders
  IF v_pedido.status NOT IN ('aprovado', 'concluido') THEN
    RAISE EXCEPTION 'Pedido precisa estar aprovado ou concluído para gerar NF-e (status atual: %).',
      v_pedido.status USING errcode = '22023';
  END IF;

  -- ─── Check if NF-e already exists for this order ─────────
  SELECT e.id INTO v_existing
  FROM public.fiscal_nfe_emissoes e
  WHERE e.empresa_id = v_empresa
    AND e.pedido_origem_id = p_pedido_id
    AND e.status NOT IN ('cancelada', 'erro', 'rejeitada')
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma NF-e (%) vinculada a este pedido.',
      v_existing USING errcode = 'P0002';
  END IF;

  -- ─── Read emitente config ───────────────────────────────
  SELECT * INTO v_emitente
  FROM public.fiscal_nfe_emitente
  WHERE empresa_id = v_empresa;

  IF v_emitente IS NULL THEN
    RAISE EXCEPTION 'Cadastro fiscal do emitente não configurado. Configure em Fiscal > Configurações.'
      USING errcode = 'P0003';
  END IF;

  -- ─── Determine ambiente ─────────────────────────────────
  IF p_ambiente IS NOT NULL AND btrim(p_ambiente) <> '' THEN
    v_ambiente := btrim(p_ambiente);
  ELSE
    -- Use the company's default configured ambiente
    SELECT COALESCE(c.ambiente, 'homologacao') INTO v_ambiente
    FROM public.fiscal_nfe_emissao_configs c
    WHERE c.empresa_id = v_empresa
      AND c.provider_slug = 'FOCUSNFE'
    LIMIT 1;

    IF v_ambiente IS NULL THEN
      v_ambiente := 'homologacao';
    END IF;
  END IF;

  IF v_ambiente NOT IN ('homologacao', 'producao') THEN
    RAISE EXCEPTION 'Ambiente inválido: %.', v_ambiente USING errcode = '22023';
  END IF;

  -- ─── Build items array from order line items ────────────
  FOR v_item IN
    SELECT
      i.produto_id,
      COALESCE(pr.nome, 'Produto') AS descricao,
      COALESCE(pr.unidade, 'un')   AS unidade,
      i.quantidade,
      i.preco_unitario              AS valor_unitario,
      i.desconto                    AS valor_desconto,
      pr.ncm,
      COALESCE(pr.cfop_padrao, '5102') AS cfop,
      pr.cst_padrao                 AS cst,
      pr.csosn_padrao               AS csosn
    FROM public.vendas_itens_pedido i
    JOIN public.produtos pr ON pr.id = i.produto_id
    WHERE i.pedido_id = p_pedido_id
      AND i.empresa_id = v_empresa
    ORDER BY i.created_at, i.id
  LOOP
    v_item_obj := jsonb_build_object(
      'produto_id',    v_item.produto_id,
      'descricao',     v_item.descricao,
      'unidade',       v_item.unidade,
      'quantidade',    v_item.quantidade,
      'valor_unitario', v_item.valor_unitario,
      'valor_desconto', v_item.valor_desconto,
      'ncm',           v_item.ncm,
      'cfop',          v_item.cfop,
      'cst',           v_item.cst,
      'csosn',         v_item.csosn
    );
    v_items := v_items || v_item_obj;
  END LOOP;

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Pedido não possui itens.' USING errcode = '22023';
  END IF;

  -- ─── Create the NF-e draft via existing upsert RPC ──────
  -- We call it with service_role context (SECURITY DEFINER), so role check
  -- inside draft_upsert would fail. Instead, we do a direct insert that
  -- mirrors draft_upsert logic.

  INSERT INTO public.fiscal_nfe_emissoes (
    empresa_id,
    provider_slug,
    ambiente,
    status,
    destinatario_pessoa_id,
    natureza_operacao,
    total_frete,
    pedido_origem_id,
    payload
  )
  VALUES (
    v_empresa,
    'FOCUSNFE',
    v_ambiente,
    'rascunho',
    v_pedido.cliente_id,
    'Venda',
    COALESCE(v_pedido.frete, 0),
    p_pedido_id,
    jsonb_build_object(
      'origem', 'pedido_venda',
      'pedido_numero', v_pedido.numero,
      'pedido_id', p_pedido_id
    )
  )
  RETURNING id INTO v_emissao_id;

  -- Insert items
  INSERT INTO public.fiscal_nfe_emissao_itens (
    empresa_id,
    emissao_id,
    produto_id,
    ordem,
    descricao,
    unidade,
    ncm,
    cfop,
    cst,
    csosn,
    quantidade,
    valor_unitario,
    valor_desconto,
    valor_total
  )
  SELECT
    v_empresa,
    v_emissao_id,
    NULLIF(btrim(COALESCE(it->>'produto_id', '')), '')::uuid,
    (row_number() OVER ())::int AS ordem,
    COALESCE(NULLIF(btrim(COALESCE(it->>'descricao', '')), ''), 'Item'),
    COALESCE(NULLIF(btrim(COALESCE(it->>'unidade', '')), ''), 'un'),
    NULLIF(btrim(COALESCE(it->>'ncm', '')), ''),
    NULLIF(btrim(COALESCE(it->>'cfop', '')), ''),
    NULLIF(btrim(COALESCE(it->>'cst', '')), ''),
    NULLIF(btrim(COALESCE(it->>'csosn', '')), ''),
    COALESCE(NULLIF(it->>'quantidade', '')::numeric, 0),
    COALESCE(NULLIF(it->>'valor_unitario', '')::numeric, 0),
    COALESCE(NULLIF(it->>'valor_desconto', '')::numeric, 0),
    GREATEST(
      0,
      (COALESCE(NULLIF(it->>'quantidade', '')::numeric, 0) * COALESCE(NULLIF(it->>'valor_unitario', '')::numeric, 0))
      - COALESCE(NULLIF(it->>'valor_desconto', '')::numeric, 0)
    )
  FROM jsonb_array_elements(v_items) it;

  -- Recalculate totals
  PERFORM public.fiscal_nfe_recalc_totais(v_emissao_id);

  RETURN v_emissao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_gerar_de_pedido(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_gerar_de_pedido(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 4. Update fiscal_nfe_emissoes_list to include pedido_origem_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissoes_list(
  p_status text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  status text,
  numero int,
  serie int,
  chave_acesso text,
  destinatario_pessoa_id uuid,
  destinatario_nome text,
  ambiente text,
  natureza_operacao text,
  valor_total numeric,
  total_produtos numeric,
  total_descontos numeric,
  total_frete numeric,
  total_impostos numeric,
  total_nfe numeric,
  payload jsonb,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz,
  pedido_origem_id uuid,
  danfe_url text,
  xml_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit   int  := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
  v_status  text := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_q       text := NULLIF(btrim(COALESCE(p_q, '')), '');
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.status,
    e.numero,
    e.serie,
    e.chave_acesso,
    e.destinatario_pessoa_id,
    p.nome AS destinatario_nome,
    e.ambiente,
    e.natureza_operacao,
    e.valor_total,
    e.total_produtos,
    e.total_descontos,
    e.total_frete,
    e.total_impostos,
    e.total_nfe,
    e.payload,
    e.last_error,
    e.created_at,
    e.updated_at,
    e.pedido_origem_id,
    nio.danfe_url,
    nio.xml_url
  FROM public.fiscal_nfe_emissoes e
  LEFT JOIN public.pessoas p ON p.id = e.destinatario_pessoa_id
  LEFT JOIN public.fiscal_nfe_nfeio_emissoes nio ON nio.emissao_id = e.id
  WHERE e.empresa_id = v_empresa
    AND (v_status IS NULL OR e.status = v_status)
    AND (
      v_q IS NULL
      OR e.chave_acesso ILIKE '%' || v_q || '%'
      OR p.nome ILIKE '%' || v_q || '%'
      OR e.status ILIKE '%' || v_q || '%'
      OR e.numero::text ILIKE '%' || v_q || '%'
      OR e.serie::text ILIKE '%' || v_q || '%'
    )
  ORDER BY e.updated_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissoes_list(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissoes_list(text, text, int) TO authenticated, service_role;

COMMIT;
