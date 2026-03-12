-- =============================================
-- Migration: ind_faturamento_direto
-- Faturamento direto da indústria — NF-e sem exigir fluxo completo de produção
--
-- Cenário A: Botão "Faturar" na OP (qualquer status exceto cancelada)
-- Cenário B: "Faturar Sem Produção" (pular OP completamente)
-- =============================================

-- ─────────────────────────────────────────────
-- 1) Novas colunas
-- ─────────────────────────────────────────────

-- Link OP → Pedido de Venda (opcional)
ALTER TABLE public.industria_producao_ordens
  ADD COLUMN IF NOT EXISTS pedido_venda_id uuid
    REFERENCES public.vendas_pedidos(id) ON DELETE SET NULL;

-- Status de faturamento na OP
ALTER TABLE public.industria_producao_ordens
  ADD COLUMN IF NOT EXISTS status_faturamento text
    NOT NULL DEFAULT 'nao_faturado';

-- Check constraint (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industria_producao_ordens_status_faturamento_ck'
  ) THEN
    ALTER TABLE public.industria_producao_ordens
      ADD CONSTRAINT industria_producao_ordens_status_faturamento_ck
      CHECK (status_faturamento IN ('nao_faturado','parcialmente_faturado','faturado'));
  END IF;
END $$;

-- Link NF-e → OP (rastreabilidade)
ALTER TABLE public.fiscal_nfe_emissoes
  ADD COLUMN IF NOT EXISTS ordem_producao_id uuid
    REFERENCES public.industria_producao_ordens(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_industria_op_pedido_venda
  ON public.industria_producao_ordens (pedido_venda_id)
  WHERE pedido_venda_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_nfe_emissoes_ordem_producao
  ON public.fiscal_nfe_emissoes (ordem_producao_id)
  WHERE ordem_producao_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_industria_op_status_faturamento
  ON public.industria_producao_ordens (empresa_id, status_faturamento);


-- ─────────────────────────────────────────────
-- 2) DROP/RECREATE industria_producao_list_ordens
--    (adiciona status_faturamento e pedido_venda_id)
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.industria_producao_list_ordens(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.industria_producao_list_ordens(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id                    uuid,
  numero                integer,
  produto_nome          text,
  quantidade_planejada  numeric,
  unidade               text,
  status                text,
  prioridade            integer,
  data_prevista_entrega date,
  total_entregue        numeric,
  percentual_concluido  numeric,
  status_faturamento    text,
  pedido_venda_id       uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    o.id,
    o.numero,
    p.nome as produto_nome,
    o.quantidade_planejada,
    o.unidade,
    o.status,
    o.prioridade,
    o.data_prevista_entrega,
    coalesce(sum(e.quantidade_entregue), 0) as total_entregue,
    case
      when o.quantidade_planejada > 0 then
        round((coalesce(sum(e.quantidade_entregue), 0) / o.quantidade_planejada) * 100, 2)
      else 0
    end as percentual_concluido,
    o.status_faturamento,
    o.pedido_venda_id
  from public.industria_producao_ordens o
  join public.produtos p
    on o.produto_final_id = p.id
  left join public.industria_producao_entregas e
    on e.ordem_id = o.id
   and e.empresa_id = v_empresa_id
  where o.empresa_id = v_empresa_id
    and (
      p_search is null
      or o.numero::text ilike '%' || p_search || '%'
      or p.nome          ilike '%' || p_search || '%'
    )
    and (p_status is null or o.status = p_status)
  group by o.id, p.nome
  order by
    o.prioridade           desc,
    o.data_prevista_entrega asc nulls last,
    o.created_at           desc
  limit p_limit offset p_offset;
end;
$$;

REVOKE ALL ON FUNCTION public.industria_producao_list_ordens(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_producao_list_ordens(text, text, integer, integer)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- 3) UPDATE industria_producao_get_ordem_details
--    (adiciona status_faturamento e pedido_venda_id ao jsonb)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.industria_producao_get_ordem_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_ordem record;
  v_componentes jsonb;
  v_entregas jsonb;
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  SELECT
    o.*,
    p.nome AS produto_nome
    INTO v_ordem
    FROM public.industria_producao_ordens o
    JOIN public.produtos p ON p.id = o.produto_final_id
   WHERE o.id = p_id
     AND o.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'ordem_id', c.ordem_id,
      'produto_id', c.produto_id,
      'produto_nome', p.nome,
      'quantidade_planejada', c.quantidade_planejada,
      'quantidade_consumida', c.quantidade_consumida,
      'quantidade_reservada', c.quantidade_reservada,
      'unidade', c.unidade,
      'origem', c.origem
    )
  )
  INTO v_componentes
  FROM public.industria_producao_componentes c
  JOIN public.produtos p ON p.id = c.produto_id
  WHERE c.ordem_id = p_id
    AND c.empresa_id = v_empresa_id;

  SELECT jsonb_agg(e)
  INTO v_entregas
  FROM public.industria_producao_entregas e
  WHERE e.ordem_id = p_id
    AND e.empresa_id = v_empresa_id;

  RETURN jsonb_build_object(
    'id',                        v_ordem.id,
    'empresa_id',                v_ordem.empresa_id,
    'numero',                    v_ordem.numero,
    'origem_ordem',              v_ordem.origem_ordem,
    'produto_final_id',          v_ordem.produto_final_id,
    'produto_nome',              v_ordem.produto_nome,
    'quantidade_planejada',      v_ordem.quantidade_planejada,
    'unidade',                   v_ordem.unidade,
    'status',                    v_ordem.status,
    'prioridade',                v_ordem.prioridade,
    'data_prevista_inicio',      v_ordem.data_prevista_inicio,
    'data_prevista_fim',         v_ordem.data_prevista_fim,
    'data_prevista_entrega',     v_ordem.data_prevista_entrega,
    'documento_ref',             v_ordem.documento_ref,
    'observacoes',               v_ordem.observacoes,
    'roteiro_aplicado_id',       v_ordem.roteiro_aplicado_id,
    'roteiro_aplicado_desc',     v_ordem.roteiro_aplicado_desc,
    'bom_aplicado_id',           v_ordem.bom_aplicado_id,
    'bom_aplicado_desc',         v_ordem.bom_aplicado_desc,
    'lote_producao',             v_ordem.lote_producao,
    'reserva_modo',              v_ordem.reserva_modo,
    'tolerancia_overrun_percent', v_ordem.tolerancia_overrun_percent,
    'status_faturamento',        v_ordem.status_faturamento,
    'pedido_venda_id',           v_ordem.pedido_venda_id,
    'created_at',                v_ordem.created_at,
    'updated_at',                v_ordem.updated_at,
    'componentes',               coalesce(v_componentes, '[]'::jsonb),
    'entregas',                  coalesce(v_entregas, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.industria_producao_get_ordem_details(uuid)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- 4) RPC: industria_faturar_op
--    Cenário A — Faturar diretamente a partir de uma OP
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.industria_faturar_op(uuid, uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.industria_faturar_op(
  p_ordem_id       uuid,
  p_cliente_id     uuid    DEFAULT NULL,
  p_preco_unitario numeric DEFAULT NULL,
  p_natureza       text    DEFAULT 'Venda de Produção'
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

  -- 1. Ler OP + dados do produto
  SELECT o.*,
         p.nome       AS produto_nome,
         p.preco_venda AS produto_preco_venda,
         p.unidade    AS produto_unidade
  INTO v_ordem
  FROM public.industria_producao_ordens o
  JOIN public.produtos p ON p.id = o.produto_final_id
  WHERE o.id = p_ordem_id AND o.empresa_id = v_empresa;

  IF v_ordem IS NULL THEN
    RAISE EXCEPTION 'Ordem de produção não encontrada.' USING errcode = 'P0001';
  END IF;

  IF v_ordem.status = 'cancelada' THEN
    RAISE EXCEPTION 'Ordem de produção está cancelada.' USING errcode = '22023';
  END IF;

  IF v_ordem.status_faturamento = 'faturado' THEN
    RAISE EXCEPTION 'Ordem de produção já foi faturada.' USING errcode = 'P0002';
  END IF;

  -- 2. Determinar cliente
  v_cliente := COALESCE(p_cliente_id, NULL);
  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'Informe o cliente (destinatário) para faturamento.' USING errcode = '22023';
  END IF;

  -- 3. Determinar preço
  v_preco := COALESCE(p_preco_unitario, v_ordem.produto_preco_venda, 0);
  v_total := GREATEST(0, v_ordem.quantidade_planejada * v_preco);

  -- 4. Criar ou reutilizar pedido de venda
  IF v_ordem.pedido_venda_id IS NOT NULL THEN
    -- Pedido já vinculado → reutilizar
    v_pedido_id := v_ordem.pedido_venda_id;
  ELSE
    -- Criar pedido auto-aprovado
    INSERT INTO public.vendas_pedidos (
      empresa_id, cliente_id, status, data_emissao,
      total_produtos, frete, desconto, total_geral,
      observacoes
    )
    VALUES (
      v_empresa, v_cliente, 'aprovado', current_date,
      v_total, 0, 0, v_total,
      'Gerado automaticamente — OP #' || v_ordem.numero
    )
    RETURNING id INTO v_pedido_id;

    -- Criar item do pedido
    INSERT INTO public.vendas_itens_pedido (
      empresa_id, pedido_id, produto_id,
      quantidade, preco_unitario, desconto, total
    )
    VALUES (
      v_empresa, v_pedido_id, v_ordem.produto_final_id,
      v_ordem.quantidade_planejada, v_preco, 0, v_total
    );

    -- Recalcular totais do pedido
    PERFORM public.vendas_recalcular_totais(v_pedido_id);

    -- Vincular OP → Pedido
    UPDATE public.industria_producao_ordens
    SET pedido_venda_id = v_pedido_id, updated_at = now()
    WHERE id = p_ordem_id AND empresa_id = v_empresa;
  END IF;

  -- 5. Gerar NF-e draft a partir do pedido
  v_emissao_id := public.fiscal_nfe_gerar_de_pedido(v_pedido_id);

  -- 6. Vincular NF-e → OP + atualizar natureza da operação
  UPDATE public.fiscal_nfe_emissoes
  SET ordem_producao_id = p_ordem_id,
      natureza_operacao = COALESCE(NULLIF(btrim(p_natureza), ''), natureza_operacao)
  WHERE id = v_emissao_id AND empresa_id = v_empresa;

  -- 7. Atualizar status de faturamento na OP
  UPDATE public.industria_producao_ordens
  SET status_faturamento = 'faturado', updated_at = now()
  WHERE id = p_ordem_id AND empresa_id = v_empresa;

  RETURN jsonb_build_object(
    'pedido_id',  v_pedido_id,
    'emissao_id', v_emissao_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.industria_faturar_op(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_faturar_op(uuid, uuid, numeric, text)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- 5) RPC: industria_faturar_sem_producao
--    Cenário B — Faturar sem OP (pula produção)
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.industria_faturar_sem_producao(uuid, uuid, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.industria_faturar_sem_producao(
  p_cliente_id     uuid,
  p_produto_id     uuid,
  p_quantidade     numeric,
  p_preco_unitario numeric,
  p_natureza       text DEFAULT 'Venda de Produção'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_empresa     uuid := public.current_empresa_id();
  v_produto     record;
  v_pedido_id   uuid;
  v_emissao_id  uuid;
  v_total       numeric;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  -- Validações
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Informe o cliente.' USING errcode = '22023';
  END IF;

  IF p_produto_id IS NULL THEN
    RAISE EXCEPTION 'Informe o produto.' USING errcode = '22023';
  END IF;

  IF COALESCE(p_quantidade, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.' USING errcode = '22023';
  END IF;

  IF COALESCE(p_preco_unitario, 0) < 0 THEN
    RAISE EXCEPTION 'Preço unitário não pode ser negativo.' USING errcode = '22023';
  END IF;

  -- Validar produto
  SELECT id, nome, unidade INTO v_produto
  FROM public.produtos
  WHERE id = p_produto_id AND empresa_id = v_empresa;

  IF v_produto IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING errcode = 'P0001';
  END IF;

  v_total := GREATEST(0, p_quantidade * COALESCE(p_preco_unitario, 0));

  -- Criar pedido auto-aprovado
  INSERT INTO public.vendas_pedidos (
    empresa_id, cliente_id, status, data_emissao,
    total_produtos, frete, desconto, total_geral,
    observacoes
  )
  VALUES (
    v_empresa, p_cliente_id, 'aprovado', current_date,
    v_total, 0, 0, v_total,
    'Faturamento direto (sem ordem de produção)'
  )
  RETURNING id INTO v_pedido_id;

  -- Criar item do pedido
  INSERT INTO public.vendas_itens_pedido (
    empresa_id, pedido_id, produto_id,
    quantidade, preco_unitario, desconto, total
  )
  VALUES (
    v_empresa, v_pedido_id, p_produto_id,
    p_quantidade, COALESCE(p_preco_unitario, 0), 0, v_total
  );

  -- Recalcular totais
  PERFORM public.vendas_recalcular_totais(v_pedido_id);

  -- Gerar NF-e draft
  v_emissao_id := public.fiscal_nfe_gerar_de_pedido(v_pedido_id);

  -- Atualizar natureza da operação se fornecida
  IF p_natureza IS NOT NULL AND btrim(p_natureza) <> '' THEN
    UPDATE public.fiscal_nfe_emissoes
    SET natureza_operacao = btrim(p_natureza)
    WHERE id = v_emissao_id AND empresa_id = v_empresa;
  END IF;

  RETURN jsonb_build_object(
    'pedido_id',  v_pedido_id,
    'emissao_id', v_emissao_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.industria_faturar_sem_producao(uuid, uuid, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_faturar_sem_producao(uuid, uuid, numeric, numeric, text)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- 6) RPC: industria_kpis_faturamento
--    KPIs do dashboard industrial
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
  v_total_ordens     bigint;
  v_pendente         bigint;
  v_faturadas        bigint;
  v_valor_pendente   numeric;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

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

  RETURN jsonb_build_object(
    'total_ordens',          v_total_ordens,
    'pendente_faturamento',  v_pendente,
    'faturadas',             v_faturadas,
    'valor_pendente',        v_valor_pendente
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
