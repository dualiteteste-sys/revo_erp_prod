-- =============================================
-- Migration: ind_faturamento_ob
-- Faturamento direto para Ordens de Beneficiamento (OB)
-- Espelha a funcionalidade de industria_faturar_op (OP)
-- para a tabela industria_ordens (OB/beneficiamento)
-- =============================================

-- ─────────────────────────────────────────────
-- 1) Novas colunas em industria_ordens
-- ─────────────────────────────────────────────

-- Link OB → Pedido de Venda (opcional)
ALTER TABLE public.industria_ordens
  ADD COLUMN IF NOT EXISTS pedido_venda_id uuid
    REFERENCES public.vendas_pedidos(id) ON DELETE SET NULL;

-- Status de faturamento na OB
ALTER TABLE public.industria_ordens
  ADD COLUMN IF NOT EXISTS status_faturamento text
    NOT NULL DEFAULT 'nao_faturado';

-- Check constraint (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ind_ordens_status_faturamento'
  ) THEN
    ALTER TABLE public.industria_ordens
      ADD CONSTRAINT ck_ind_ordens_status_faturamento
      CHECK (status_faturamento IN ('nao_faturado','parcialmente_faturado','faturado'));
  END IF;
END $$;

-- Link NF-e → OB (rastreabilidade)
ALTER TABLE public.fiscal_nfe_emissoes
  ADD COLUMN IF NOT EXISTS ordem_beneficiamento_id uuid
    REFERENCES public.industria_ordens(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_industria_ordens_pedido_venda
  ON public.industria_ordens (pedido_venda_id)
  WHERE pedido_venda_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_industria_ordens_status_faturamento
  ON public.industria_ordens (empresa_id, status_faturamento);

CREATE INDEX IF NOT EXISTS idx_fiscal_nfe_emissoes_ordem_benef
  ON public.fiscal_nfe_emissoes (ordem_beneficiamento_id)
  WHERE ordem_beneficiamento_id IS NOT NULL;


-- ─────────────────────────────────────────────
-- 2) DROP/RECREATE industria_list_ordens
--    (adiciona status_faturamento e pedido_venda_id)
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.industria_list_ordens(text, text, text, int, int);

CREATE OR REPLACE FUNCTION public.industria_list_ordens(
  p_search text DEFAULT NULL,
  p_tipo   text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  id                   uuid,
  numero               int,
  tipo_ordem           text,
  produto_nome         text,
  cliente_nome         text,
  quantidade_planejada numeric,
  unidade              text,
  status               text,
  prioridade           int,
  data_prevista_entrega date,
  total_entregue       numeric,
  qtde_caixas          numeric,
  numero_nf            text,
  pedido_numero        text,
  created_at           timestamptz,
  status_faturamento   text,
  pedido_venda_id      uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.numero,
    o.tipo_ordem,
    p.nome AS produto_nome,
    c.nome AS cliente_nome,
    o.quantidade_planejada,
    o.unidade,
    o.status,
    o.prioridade,
    o.data_prevista_entrega,
    COALESCE((
      SELECT SUM(e.quantidade_entregue)
      FROM public.industria_ordens_entregas e
      WHERE e.ordem_id = o.id
        AND e.empresa_id = v_empresa_id
    ), 0) AS total_entregue,
    o.qtde_caixas,
    o.numero_nf,
    o.pedido_numero,
    o.created_at,
    o.status_faturamento,
    o.pedido_venda_id
  FROM public.industria_ordens o
  JOIN public.produtos p
    ON o.produto_final_id = p.id
  LEFT JOIN public.pessoas c
    ON o.cliente_id = c.id
  WHERE o.empresa_id = v_empresa_id
    AND (
      p_search IS NULL
      OR o.numero::text ILIKE '%' || p_search || '%'
      OR p.nome          ILIKE '%' || p_search || '%'
      OR c.nome          ILIKE '%' || p_search || '%'
    )
    AND (p_tipo   IS NULL OR o.tipo_ordem = p_tipo)
    AND (p_status IS NULL OR o.status     = p_status)
  ORDER BY o.prioridade DESC, o.data_prevista_entrega ASC NULLS LAST, o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.industria_list_ordens(text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_list_ordens(text, text, text, int, int)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- 3) RPC: industria_faturar_ob
--    Faturar diretamente a partir de uma OB
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.industria_faturar_ob(uuid, uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.industria_faturar_ob(
  p_ordem_id       uuid,
  p_cliente_id     uuid    DEFAULT NULL,
  p_preco_unitario numeric DEFAULT NULL,
  p_natureza       text    DEFAULT 'Remessa de Beneficiamento'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_empresa     uuid := public.current_empresa_id();
  v_ordem       record;
  v_pedido_id   uuid;
  v_emissao_id  uuid;
  v_preco       numeric;
  v_total       numeric;
  v_cliente     uuid;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  -- 1. Ler OB + dados do produto
  SELECT o.*,
         p.nome        AS produto_nome,
         p.preco_venda AS produto_preco_venda,
         p.unidade     AS produto_unidade
  INTO v_ordem
  FROM public.industria_ordens o
  JOIN public.produtos p ON p.id = o.produto_final_id
  WHERE o.id = p_ordem_id AND o.empresa_id = v_empresa;

  IF v_ordem IS NULL THEN
    RAISE EXCEPTION 'Ordem de beneficiamento não encontrada.' USING errcode = 'P0001';
  END IF;

  IF v_ordem.status = 'cancelada' THEN
    RAISE EXCEPTION 'Ordem de beneficiamento está cancelada.' USING errcode = '22023';
  END IF;

  IF v_ordem.status_faturamento = 'faturado' THEN
    RAISE EXCEPTION 'Ordem de beneficiamento já foi faturada.' USING errcode = 'P0002';
  END IF;

  -- 2. Determinar cliente (da OB ou override)
  v_cliente := COALESCE(p_cliente_id, v_ordem.cliente_id);
  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'Informe o cliente (destinatário) para faturamento.' USING errcode = '22023';
  END IF;

  -- 3. Determinar preço
  v_preco := COALESCE(p_preco_unitario, v_ordem.produto_preco_venda, 0);
  v_total := GREATEST(0, v_ordem.quantidade_planejada * v_preco);

  -- 4. Criar ou reutilizar pedido de venda
  IF v_ordem.pedido_venda_id IS NOT NULL THEN
    v_pedido_id := v_ordem.pedido_venda_id;
  ELSE
    INSERT INTO public.vendas_pedidos (
      empresa_id, cliente_id, status, data_emissao,
      total_produtos, frete, desconto, total_geral,
      observacoes
    )
    VALUES (
      v_empresa, v_cliente, 'aprovado', current_date,
      v_total, 0, 0, v_total,
      'Gerado automaticamente — OB #' || v_ordem.numero
    )
    RETURNING id INTO v_pedido_id;

    INSERT INTO public.vendas_itens_pedido (
      empresa_id, pedido_id, produto_id,
      quantidade, preco_unitario, desconto, total
    )
    VALUES (
      v_empresa, v_pedido_id, v_ordem.produto_final_id,
      v_ordem.quantidade_planejada, v_preco, 0, v_total
    );

    PERFORM public.vendas_recalcular_totais(v_pedido_id);

    UPDATE public.industria_ordens
    SET pedido_venda_id = v_pedido_id, updated_at = now()
    WHERE id = p_ordem_id AND empresa_id = v_empresa;
  END IF;

  -- 5. Gerar NF-e draft a partir do pedido
  v_emissao_id := public.fiscal_nfe_gerar_de_pedido(v_pedido_id);

  -- 6. Vincular NF-e → OB + atualizar natureza
  UPDATE public.fiscal_nfe_emissoes
  SET ordem_beneficiamento_id = p_ordem_id,
      natureza_operacao = COALESCE(NULLIF(btrim(p_natureza), ''), natureza_operacao)
  WHERE id = v_emissao_id AND empresa_id = v_empresa;

  -- 7. Atualizar status de faturamento na OB
  UPDATE public.industria_ordens
  SET status_faturamento = 'faturado', updated_at = now()
  WHERE id = p_ordem_id AND empresa_id = v_empresa;

  RETURN jsonb_build_object(
    'pedido_id',  v_pedido_id,
    'emissao_id', v_emissao_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.industria_faturar_ob(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_faturar_ob(uuid, uuid, numeric, text)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- 4) UPDATE industria_kpis_faturamento
--    Inclui contagem de OBs
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.industria_kpis_faturamento();

CREATE OR REPLACE FUNCTION public.industria_kpis_faturamento()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_empresa          uuid := public.current_empresa_id();
  -- OP (industria_producao_ordens)
  v_total_ordens     bigint;
  v_pendente         bigint;
  v_faturadas        bigint;
  v_valor_pendente   numeric;
  -- OB (industria_ordens)
  v_total_ob         bigint;
  v_ob_pendente      bigint;
  v_ob_faturadas     bigint;
  v_ob_valor_pendente numeric;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  -- KPIs para OPs
  SELECT
    count(*),
    count(*) FILTER (WHERE o.status_faturamento = 'nao_faturado'),
    count(*) FILTER (WHERE o.status_faturamento = 'faturado')
  INTO v_total_ordens, v_pendente, v_faturadas
  FROM public.industria_producao_ordens o
  WHERE o.empresa_id = v_empresa
    AND o.status <> 'cancelada';

  SELECT COALESCE(SUM(o.quantidade_planejada * COALESCE(p.preco_venda, 0)), 0)
  INTO v_valor_pendente
  FROM public.industria_producao_ordens o
  JOIN public.produtos p ON p.id = o.produto_final_id
  WHERE o.empresa_id = v_empresa
    AND o.status <> 'cancelada'
    AND o.status_faturamento = 'nao_faturado';

  -- KPIs para OBs
  SELECT
    count(*),
    count(*) FILTER (WHERE ob.status_faturamento = 'nao_faturado'),
    count(*) FILTER (WHERE ob.status_faturamento = 'faturado')
  INTO v_total_ob, v_ob_pendente, v_ob_faturadas
  FROM public.industria_ordens ob
  WHERE ob.empresa_id = v_empresa
    AND ob.status <> 'cancelada';

  SELECT COALESCE(SUM(ob.quantidade_planejada * COALESCE(p.preco_venda, 0)), 0)
  INTO v_ob_valor_pendente
  FROM public.industria_ordens ob
  JOIN public.produtos p ON p.id = ob.produto_final_id
  WHERE ob.empresa_id = v_empresa
    AND ob.status <> 'cancelada'
    AND ob.status_faturamento = 'nao_faturado';

  RETURN jsonb_build_object(
    'total_ordens',          v_total_ordens,
    'pendente_faturamento',  v_pendente,
    'faturadas',             v_faturadas,
    'valor_pendente',        v_valor_pendente,
    'total_ob',              v_total_ob,
    'ob_pendente_faturamento', v_ob_pendente,
    'ob_faturadas',          v_ob_faturadas,
    'ob_valor_pendente',     v_ob_valor_pendente
  );
END;
$$;

REVOKE ALL ON FUNCTION public.industria_kpis_faturamento() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_kpis_faturamento()
  TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- Reload PostgREST schema cache
-- ─────────────────────────────────────────────

SELECT pg_notify('pgrst', 'reload schema');
