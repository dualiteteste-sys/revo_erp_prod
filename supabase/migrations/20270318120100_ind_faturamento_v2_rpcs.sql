-- =============================================
-- Migration: ind_faturamento_v2_rpcs
-- RPCs para o novo faturamento de beneficiamento:
--   1. industria_faturamento_listar_elegiveis
--   2. industria_faturamento_compor_nfe
--   3. industria_faturamento_liberar_entregas
-- =============================================

-- ─────────────────────────────────────────────
-- 1) RPC: listar entregas elegíveis para faturamento
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.industria_faturamento_listar_elegiveis(uuid, date, date, text, int, int);

CREATE OR REPLACE FUNCTION public.industria_faturamento_listar_elegiveis(
  p_cliente_id   uuid   DEFAULT NULL,
  p_data_inicio  date   DEFAULT NULL,
  p_data_fim     date   DEFAULT NULL,
  p_search       text   DEFAULT NULL,
  p_limit        int    DEFAULT 200,
  p_offset       int    DEFAULT 0
)
RETURNS TABLE(
  entrega_id           uuid,
  ordem_id             uuid,
  ordem_numero         int,
  produto_id           uuid,
  produto_nome         text,
  produto_ncm          text,
  produto_unidade      text,
  produto_preco_venda  numeric,
  cliente_id           uuid,
  cliente_nome         text,
  data_entrega         date,
  quantidade_entregue  numeric,
  quantidade_ja_faturada numeric,
  quantidade_disponivel  numeric,
  documento_ref        text,
  observacoes          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_search  text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id                    AS entrega_id,
    o.id                    AS ordem_id,
    o.numero                AS ordem_numero,
    p.id                    AS produto_id,
    p.nome                  AS produto_nome,
    p.ncm                   AS produto_ncm,
    coalesce(p.unidade, o.unidade, 'un') AS produto_unidade,
    coalesce(p.preco_venda, 0)           AS produto_preco_venda,
    cli.id                  AS cliente_id,
    cli.nome                AS cliente_nome,
    e.data_entrega,
    e.quantidade_entregue,
    coalesce(fat_agg.total_faturada, 0)  AS quantidade_ja_faturada,
    (e.quantidade_entregue - coalesce(fat_agg.total_faturada, 0)) AS quantidade_disponivel,
    coalesce(e.documento_ref, e.documento_entrega) AS documento_ref,
    e.observacoes
  FROM public.industria_ordens_entregas e
  JOIN public.industria_ordens o
    ON o.id = e.ordem_id AND o.empresa_id = v_empresa
  JOIN public.produtos p
    ON p.id = o.produto_final_id AND p.empresa_id = v_empresa
  LEFT JOIN public.pessoas cli
    ON cli.id = o.cliente_id AND cli.empresa_id = v_empresa
  LEFT JOIN LATERAL (
    SELECT sum(fe.quantidade_faturada) AS total_faturada
    FROM public.industria_faturamento_entregas fe
    WHERE fe.entrega_id = e.id AND fe.empresa_id = v_empresa
  ) fat_agg ON true
  WHERE e.empresa_id = v_empresa
    AND e.status_faturamento = 'pronto_para_faturar'
    AND (e.quantidade_entregue - coalesce(fat_agg.total_faturada, 0)) > 0
    AND o.tipo_ordem = 'beneficiamento'
    AND o.status <> 'cancelada'
    -- Filtros opcionais
    AND (p_cliente_id IS NULL OR o.cliente_id = p_cliente_id)
    AND (p_data_inicio IS NULL OR e.data_entrega >= p_data_inicio)
    AND (p_data_fim IS NULL OR e.data_entrega <= p_data_fim)
    AND (v_search IS NULL OR (
      p.nome ILIKE '%' || v_search || '%'
      OR cli.nome ILIKE '%' || v_search || '%'
      OR o.numero::text ILIKE '%' || v_search || '%'
    ))
  ORDER BY cli.nome, o.numero, e.data_entrega
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.industria_faturamento_listar_elegiveis(uuid, date, date, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_faturamento_listar_elegiveis(uuid, date, date, text, int, int) TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- 2) RPC: compor NF-e a partir de entregas elegíveis
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.industria_faturamento_compor_nfe(uuid, text, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.industria_faturamento_compor_nfe(
  p_cliente_id            uuid,
  p_natureza_operacao     text    DEFAULT 'Retorno de Beneficiamento',
  p_natureza_operacao_id  uuid    DEFAULT NULL,
  p_ambiente              text    DEFAULT 'homologacao',
  p_itens                 jsonb   DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa      uuid := public.current_empresa_id();
  v_item         jsonb;
  v_entrega_id   uuid;
  v_entrega      record;
  v_produto      record;
  v_nfe_items    jsonb := '[]'::jsonb;
  v_nfe_item     jsonb;
  v_emissao_id   uuid;
  v_ordem        int := 0;
  v_total        numeric := 0;
  v_qty          numeric;
  v_price        numeric;
  v_disponivel   numeric;
  v_fat_sum      numeric;
  v_ordens_afetadas uuid[];
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Cliente (destinatário) é obrigatório.';
  END IF;

  IF jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Nenhum item selecionado para faturamento.';
  END IF;

  -- Validar e montar itens NF-e
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_entrega_id := (v_item->>'entrega_id')::uuid;
    v_qty        := coalesce((v_item->>'quantidade')::numeric, 0);
    v_price      := (v_item->>'preco_unitario')::numeric;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade deve ser maior que zero para entrega %.', v_entrega_id;
    END IF;

    -- Buscar entrega + validar
    SELECT e.*, o.produto_final_id, o.cliente_id AS ordem_cliente_id, o.id AS parent_ordem_id
    INTO v_entrega
    FROM public.industria_ordens_entregas e
    JOIN public.industria_ordens o ON o.id = e.ordem_id AND o.empresa_id = v_empresa
    WHERE e.id = v_entrega_id AND e.empresa_id = v_empresa;

    IF v_entrega IS NULL THEN
      RAISE EXCEPTION 'Entrega % não encontrada.', v_entrega_id;
    END IF;

    IF v_entrega.status_faturamento <> 'pronto_para_faturar' THEN
      RAISE EXCEPTION 'Entrega % não está pronta para faturar (status: %).', v_entrega_id, v_entrega.status_faturamento;
    END IF;

    IF v_entrega.ordem_cliente_id <> p_cliente_id THEN
      RAISE EXCEPTION 'Entrega % pertence a outro cliente.', v_entrega_id;
    END IF;

    -- Verificar quantidade disponível
    SELECT coalesce(sum(fe.quantidade_faturada), 0) INTO v_fat_sum
    FROM public.industria_faturamento_entregas fe
    WHERE fe.entrega_id = v_entrega_id AND fe.empresa_id = v_empresa;

    v_disponivel := v_entrega.quantidade_entregue - v_fat_sum;
    IF v_qty > v_disponivel THEN
      RAISE EXCEPTION 'Quantidade % excede disponível % para entrega %.', v_qty, v_disponivel, v_entrega_id;
    END IF;

    -- Buscar dados do produto
    SELECT p.nome, p.ncm, p.unidade, p.preco_venda, p.cfop_padrao, p.cst_padrao, p.csosn_padrao
    INTO v_produto
    FROM public.produtos p
    WHERE p.id = v_entrega.produto_final_id AND p.empresa_id = v_empresa;

    -- Montar item NF-e
    v_ordem := v_ordem + 1;
    v_price := coalesce(v_price, coalesce(v_produto.preco_venda, 0));

    v_nfe_item := jsonb_build_object(
      'produto_id',  v_entrega.produto_final_id,
      'descricao',   coalesce(v_item->>'descricao_override', v_produto.nome, 'Produto'),
      'unidade',     coalesce(v_produto.unidade, 'un'),
      'quantidade',  v_qty,
      'valor_unitario', v_price,
      'valor_desconto', 0,
      'ncm',         coalesce(v_item->>'ncm_override', v_produto.ncm),
      'cfop',        v_produto.cfop_padrao,
      'cst',         v_produto.cst_padrao,
      'csosn',       v_produto.csosn_padrao
    );

    v_nfe_items := v_nfe_items || v_nfe_item;
    v_total := v_total + (v_qty * v_price);

    -- Rastrear ordens afetadas
    IF NOT v_entrega.parent_ordem_id = ANY(coalesce(v_ordens_afetadas, ARRAY[]::uuid[])) THEN
      v_ordens_afetadas := array_append(coalesce(v_ordens_afetadas, ARRAY[]::uuid[]), v_entrega.parent_ordem_id);
    END IF;
  END LOOP;

  -- Criar NF-e rascunho via RPC existente
  v_emissao_id := public.fiscal_nfe_emissao_draft_upsert(
    p_emissao_id             := null,
    p_destinatario_pessoa_id := p_cliente_id,
    p_ambiente               := p_ambiente,
    p_natureza_operacao      := p_natureza_operacao,
    p_total_frete            := 0,
    p_payload                := jsonb_build_object('origem', 'faturamento_beneficiamento'),
    p_items                  := v_nfe_items,
    p_natureza_operacao_id   := p_natureza_operacao_id
  );

  -- Inserir junction records e atualizar status das entregas
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_entrega_id := (v_item->>'entrega_id')::uuid;
    v_qty        := coalesce((v_item->>'quantidade')::numeric, 0);

    -- Buscar ordem_id da entrega
    SELECT e.ordem_id INTO v_entrega
    FROM public.industria_ordens_entregas e
    WHERE e.id = v_entrega_id AND e.empresa_id = v_empresa;

    -- Junction record
    INSERT INTO public.industria_faturamento_entregas (
      empresa_id, emissao_id, entrega_id, ordem_id, quantidade_faturada
    ) VALUES (
      v_empresa, v_emissao_id, v_entrega_id, v_entrega.ordem_id, v_qty
    );

    -- Atualizar status da entrega se totalmente consumida
    SELECT coalesce(sum(fe.quantidade_faturada), 0) INTO v_fat_sum
    FROM public.industria_faturamento_entregas fe
    WHERE fe.entrega_id = v_entrega_id AND fe.empresa_id = v_empresa;

    SELECT e.quantidade_entregue INTO v_disponivel
    FROM public.industria_ordens_entregas e
    WHERE e.id = v_entrega_id;

    IF v_fat_sum >= v_disponivel THEN
      UPDATE public.industria_ordens_entregas
      SET status_faturamento = 'faturado', updated_at = now()
      WHERE id = v_entrega_id AND empresa_id = v_empresa;
    END IF;
  END LOOP;

  -- Atualizar status_faturamento nas OBs afetadas
  FOR i IN 1..coalesce(array_length(v_ordens_afetadas, 1), 0) LOOP
    DECLARE
      v_oid uuid := v_ordens_afetadas[i];
      v_total_entregas int;
      v_faturadas int;
    BEGIN
      SELECT count(*), count(*) FILTER (WHERE status_faturamento = 'faturado')
      INTO v_total_entregas, v_faturadas
      FROM public.industria_ordens_entregas
      WHERE ordem_id = v_oid AND empresa_id = v_empresa;

      IF v_total_entregas > 0 AND v_faturadas = v_total_entregas THEN
        UPDATE public.industria_ordens
        SET status_faturamento = 'faturado', updated_at = now()
        WHERE id = v_oid AND empresa_id = v_empresa;
      ELSIF v_faturadas > 0 THEN
        UPDATE public.industria_ordens
        SET status_faturamento = 'parcialmente_faturado', updated_at = now()
        WHERE id = v_oid AND empresa_id = v_empresa;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'emissao_id',  v_emissao_id,
    'items_count', jsonb_array_length(p_itens),
    'total',       v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.industria_faturamento_compor_nfe(uuid, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_faturamento_compor_nfe(uuid, text, uuid, text, jsonb) TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- 3) RPC: liberar entregas para faturamento
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.industria_faturamento_liberar_entregas(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.industria_faturamento_liberar_entregas(
  p_ordem_id    uuid   DEFAULT NULL,
  p_entrega_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_count   int := 0;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  IF p_ordem_id IS NULL AND (p_entrega_ids IS NULL OR array_length(p_entrega_ids, 1) IS NULL) THEN
    RAISE EXCEPTION 'Informe p_ordem_id ou p_entrega_ids.';
  END IF;

  IF p_ordem_id IS NOT NULL THEN
    -- Liberar todas entregas nao_faturado da OB
    UPDATE public.industria_ordens_entregas
    SET status_faturamento = 'pronto_para_faturar', updated_at = now()
    WHERE ordem_id = p_ordem_id
      AND empresa_id = v_empresa
      AND status_faturamento = 'nao_faturado';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    -- Liberar entregas específicas
    UPDATE public.industria_ordens_entregas
    SET status_faturamento = 'pronto_para_faturar', updated_at = now()
    WHERE id = ANY(p_entrega_ids)
      AND empresa_id = v_empresa
      AND status_faturamento = 'nao_faturado';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('updated_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.industria_faturamento_liberar_entregas(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_faturamento_liberar_entregas(uuid, uuid[]) TO authenticated, service_role;


SELECT pg_notify('pgrst','reload schema');
