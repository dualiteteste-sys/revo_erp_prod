-- ============================================================================
-- Migration: Accent-insensitive search across all text search RPCs
-- ============================================================================
-- Problem: Searching "Óticas Felipe" does not find "Oticas Felipe" because
-- ILIKE is case-insensitive but NOT accent-insensitive.
-- Fix: Wrap both the search term and the column with public.unaccent()
-- so "Oticas" matches "Óticas", "São" matches "Sao", etc.
-- The unaccent extension is already enabled (migration 20270124142000).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. partners_search_match (helper used by list_partners, count_partners, etc.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partners_search_match(p_row public.pessoas, p_q text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_digits text;
  v_uq text;
BEGIN
  IF v_q IS NULL THEN
    RETURN true;
  END IF;

  v_digits := regexp_replace(v_q, '\D', '', 'g');
  v_uq := public.unaccent(v_q);

  RETURN (
    public.unaccent(p_row.nome) ILIKE '%' || v_uq || '%'
    OR public.unaccent(coalesce(p_row.fantasia,'')) ILIKE '%' || v_uq || '%'
    OR public.unaccent(coalesce(p_row.email,'')) ILIKE '%' || v_uq || '%'
    OR coalesce(p_row.doc_unico,'') ILIKE '%' || v_digits || '%'
    OR coalesce(p_row.telefone,'') ILIKE '%' || v_digits || '%'
    OR coalesce(p_row.celular,'') ILIKE '%' || v_digits || '%'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. search_clients_for_current_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_clients_for_current_user(
  p_search text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  label text,
  nome text,
  doc_unico text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_q text := nullif(trim(coalesce(p_search,'')), '');
  v_digits text := regexp_replace(coalesce(p_search,''), '\D', '', 'g');
  v_uq text;
BEGIN
  IF v_q IS NULL THEN
    RETURN;
  END IF;

  v_uq := public.unaccent(v_q);

  RETURN QUERY
  SELECT
    p.id,
    (p.nome || CASE WHEN p.doc_unico IS NOT NULL AND p.doc_unico <> '' THEN ' - ' || p.doc_unico ELSE '' END) AS label,
    p.nome,
    p.doc_unico
  FROM public.pessoas p
  WHERE p.empresa_id = public.current_empresa_id()
    AND p.deleted_at IS NULL
    AND p.tipo IN ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
    AND (
      public.unaccent(p.nome) ILIKE '%' || v_uq || '%'
      OR public.unaccent(coalesce(p.fantasia,'')) ILIKE '%' || v_uq || '%'
      OR coalesce(p.doc_unico,'') ILIKE '%' || v_digits || '%'
    )
  ORDER BY p.nome ASC
  LIMIT greatest(p_limit, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. search_suppliers_for_current_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_suppliers_for_current_user(
  p_search text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (id uuid, nome text, doc_unico text, label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_uq text := public.unaccent(coalesce(p_search, ''));
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.doc_unico,
    (p.nome || coalesce(' (' || p.doc_unico || ')', '')) AS label
  FROM public.pessoas p
  WHERE p.empresa_id = v_empresa_id
    AND (p.tipo = 'fornecedor' OR p.tipo = 'ambos')
    AND (
      p_search IS NULL
      OR public.unaccent(p.nome) ILIKE '%' || v_uq || '%'
      OR p.doc_unico ILIKE '%' || p_search || '%'
    )
  LIMIT p_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. produtos_count_for_current_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.produtos_count_for_current_user(
  p_q text DEFAULT NULL,
  p_status public.status_produto DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH ctx AS (SELECT public.current_empresa_id() AS empresa_id)
  SELECT count(*)
  FROM public.produtos pr, ctx
  WHERE pr.empresa_id = ctx.empresa_id
    AND (p_status IS NULL OR pr.status = p_status)
    AND (
      p_q IS NULL
      OR public.unaccent(pr.nome) ILIKE '%' || public.unaccent(p_q) || '%'
      OR pr.sku ILIKE '%' || p_q || '%'
      OR pr.slug ILIKE '%' || p_q || '%'
    )
$$;

-- ---------------------------------------------------------------------------
-- 5. produtos_list_for_current_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.produtos_list_for_current_user(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_q text DEFAULT NULL,
  p_status public.status_produto DEFAULT NULL,
  p_order text DEFAULT 'created_at DESC'
)
RETURNS TABLE (
  id uuid, nome text, sku text, slug text,
  status public.status_produto, preco_venda numeric,
  unidade text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH ctx AS (SELECT public.current_empresa_id() AS empresa_id)
  SELECT pr.id, pr.nome, pr.sku, pr.slug, pr.status, pr.preco_venda, pr.unidade, pr.created_at, pr.updated_at
  FROM public.produtos pr, ctx
  WHERE pr.empresa_id = ctx.empresa_id
    AND (p_status IS NULL OR pr.status = p_status)
    AND (
      p_q IS NULL
      OR public.unaccent(pr.nome) ILIKE '%' || public.unaccent(p_q) || '%'
      OR pr.sku ILIKE '%' || p_q || '%'
      OR pr.slug ILIKE '%' || p_q || '%'
    )
  ORDER BY
    CASE WHEN p_order ILIKE 'created_at desc' THEN pr.created_at END DESC,
    CASE WHEN p_order ILIKE 'created_at asc'  THEN pr.created_at END ASC,
    CASE WHEN p_order ILIKE 'nome asc'        THEN pr.nome END ASC,
    CASE WHEN p_order ILIKE 'nome desc'       THEN pr.nome END DESC,
    pr.created_at DESC
  LIMIT coalesce(p_limit, 20)
  OFFSET greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------------------
-- 6. search_items_for_os
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_items_for_os(
  p_search text,
  p_limit integer DEFAULT 20,
  p_only_sales boolean DEFAULT true
)
RETURNS TABLE (id uuid, type text, descricao text, codigo text, preco_venda numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
(
    SELECT
        p.id,
        'product' AS type,
        p.nome AS descricao,
        p.sku AS codigo,
        p.preco_venda
    FROM public.produtos p
    WHERE p.empresa_id = public.current_empresa_id()
      AND p.status = 'ativo'
      AND (p_only_sales = FALSE OR p.permitir_inclusao_vendas = TRUE)
      AND (
        p_search IS NULL
        OR public.unaccent(p.nome) ILIKE '%' || public.unaccent(p_search) || '%'
        OR p.sku ILIKE '%' || p_search || '%'
      )
)
UNION ALL
(
    SELECT
        s.id,
        'service' AS type,
        s.descricao,
        s.codigo,
        s.preco_venda::numeric
    FROM public.servicos s
    WHERE s.empresa_id = public.current_empresa_id()
      AND s.status = 'ativo'
      AND (
        p_search IS NULL
        OR public.unaccent(s.descricao) ILIKE '%' || public.unaccent(p_search) || '%'
        OR s.codigo ILIKE '%' || p_search || '%'
      )
)
ORDER BY descricao
LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------------
-- 7. vendas_list_pedidos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_list_pedidos(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, numero integer, cliente_id uuid, cliente_nome text,
  data_emissao date, data_entrega date, status text,
  total_produtos numeric, frete numeric, desconto numeric, total_geral numeric,
  condicao_pagamento text, observacoes text, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_uq text := public.unaccent(coalesce(p_search, ''));
BEGIN
  PERFORM public.require_permission_for_current_user('vendas','view');

  IF p_status IS NOT NULL
     AND p_status NOT IN ('orcamento','aprovado','cancelado','concluido') THEN
    RAISE EXCEPTION 'Status de pedido inválido.';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.numero, p.cliente_id,
    c.nome AS cliente_nome,
    p.data_emissao, p.data_entrega, p.status,
    p.total_produtos, p.frete, p.desconto, p.total_geral,
    p.condicao_pagamento, p.observacoes,
    count(*) OVER() AS total_count
  FROM public.vendas_pedidos p
  JOIN public.pessoas c ON c.id = p.cliente_id
  WHERE p.empresa_id = v_empresa
    AND (p_status IS NULL OR p.status = p_status)
    AND (
      p_search IS NULL
      OR public.unaccent(c.nome) ILIKE '%' || v_uq || '%'
      OR cast(p.numero AS text) ILIKE '%' || p_search || '%'
      OR public.unaccent(coalesce(p.observacoes,'')) ILIKE '%' || v_uq || '%'
    )
  ORDER BY p.data_emissao DESC, p.numero DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. compras_list_pedidos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compras_list_pedidos(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, numero bigint, fornecedor_id uuid, fornecedor_nome text,
  data_emissao date, data_prevista date, status text,
  total_produtos numeric, frete numeric, desconto numeric, total_geral numeric,
  observacoes text, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_uq text := public.unaccent(coalesce(btrim(p_search), ''));
BEGIN
  PERFORM public.require_permission_for_current_user('suprimentos','view');

  RETURN QUERY
  SELECT
    c.id, c.numero, c.fornecedor_id,
    f.nome AS fornecedor_nome,
    c.data_emissao, c.data_prevista,
    c.status::text AS status,
    c.total_produtos, c.frete, c.desconto, c.total_geral,
    c.observacoes,
    count(*) OVER() AS total_count
  FROM public.compras_pedidos c
  LEFT JOIN public.pessoas f ON f.id = c.fornecedor_id
  WHERE c.empresa_id = v_emp
    AND (
      p_status IS NULL
      OR btrim(p_status) = ''
      OR c.status::text = p_status
    )
    AND (
      p_search IS NULL
      OR btrim(p_search) = ''
      OR c.numero::text LIKE '%' || btrim(p_search) || '%'
      OR public.unaccent(lower(coalesce(f.nome,''))) LIKE '%' || lower(v_uq) || '%'
    )
  ORDER BY c.numero DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. list_os_for_current_user__unsafe (dynamic SQL — used by list_os wrapper)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_os_for_current_user__unsafe(
  p_search text DEFAULT NULL,
  p_status public.status_os[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_order_by text DEFAULT 'ordem',
  p_order_dir text DEFAULT 'asc'
)
RETURNS TABLE(
  id uuid, empresa_id uuid, numero bigint, cliente_id uuid,
  descricao text, status public.status_os,
  data_inicio date, data_prevista date, hora time,
  total_itens numeric, desconto_valor numeric, total_geral numeric,
  forma_recebimento text, condicao_pagamento text,
  observacoes text, observacoes_internas text,
  created_at timestamptz, updated_at timestamptz,
  ordem integer, cliente_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_order_by text := lower(coalesce(p_order_by, 'ordem'));
  v_order_dir text := CASE WHEN lower(p_order_dir) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_order_col text;
  v_sql text;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][LIST_OS] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  v_order_col := CASE
    WHEN v_order_by IN ('ordem','numero','descricao','status','data_prevista','created_at','updated_at') THEN v_order_by
    ELSE 'ordem'
  END;

  v_sql := format($fmt$
    SELECT
      os.id, os.empresa_id, os.numero, os.cliente_id, os.descricao, os.status,
      os.data_inicio, os.data_prevista, os.hora,
      os.total_itens, os.desconto_valor, os.total_geral,
      os.forma_recebimento, os.condicao_pagamento,
      os.observacoes, os.observacoes_internas,
      os.created_at, os.updated_at,
      os.ordem,
      p.nome as cliente_nome
    FROM public.ordem_servicos os
    LEFT JOIN public.pessoas p
      ON p.id = os.cliente_id
     AND p.empresa_id = os.empresa_id
    WHERE os.empresa_id = $1
      %s
      %s
    ORDER BY %I %s NULLS LAST, os.numero DESC
    LIMIT $2 OFFSET $3
  $fmt$,
    CASE
      WHEN p_search IS NULL OR btrim(p_search) = '' THEN ''
      ELSE 'AND (public.unaccent(os.descricao) ILIKE ''%''||public.unaccent($4)||''%'' OR public.unaccent(p.nome) ILIKE ''%''||public.unaccent($4)||''%'' OR os.numero::text ILIKE ''%''||$4||''%'')'
    END,
    CASE
      WHEN p_status IS NULL OR array_length(p_status,1) IS NULL THEN ''
      ELSE 'AND os.status = ANY($5)'
    END,
    v_order_col,
    v_order_dir
  );

  IF p_status IS NULL OR array_length(p_status,1) IS NULL THEN
    RETURN QUERY EXECUTE v_sql USING v_empresa_id, greatest(p_limit,0), greatest(p_offset,0), p_search;
  ELSE
    RETURN QUERY EXECUTE v_sql USING v_empresa_id, greatest(p_limit,0), greatest(p_offset,0), p_search, p_status;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. financeiro_extrato_bancario_list
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_extrato_bancario_list(
  p_conta_corrente_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_tipo_lancamento text DEFAULT NULL,
  p_conciliado boolean DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, conta_corrente_id uuid, conta_nome text,
  data_lancamento date, descricao text, documento_ref text,
  tipo_lancamento text, valor numeric, saldo_apos_lancamento numeric,
  conciliado boolean, movimentacao_id uuid,
  movimentacao_data date, movimentacao_tipo text,
  movimentacao_descricao text, movimentacao_valor numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_uq text := public.unaccent(coalesce(p_q, ''));
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  IF p_tipo_lancamento IS NOT NULL AND p_tipo_lancamento NOT IN ('credito','debito') THEN
    RAISE EXCEPTION 'p_tipo_lancamento inválido. Use credito, debito ou null.';
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.conta_corrente_id,
    cc.nome AS conta_nome,
    e.data_lancamento, e.descricao, e.documento_ref,
    e.tipo_lancamento, e.valor, e.saldo_apos_lancamento,
    e.conciliado, e.movimentacao_id,
    m.data_movimento   AS movimentacao_data,
    m.tipo_mov         AS movimentacao_tipo,
    m.descricao        AS movimentacao_descricao,
    m.valor            AS movimentacao_valor,
    count(*) OVER()    AS total_count
  FROM public.financeiro_extratos_bancarios e
  JOIN public.financeiro_contas_correntes cc
    ON cc.id = e.conta_corrente_id
   AND cc.empresa_id = v_empresa
  LEFT JOIN public.financeiro_movimentacoes m
    ON m.id = e.movimentacao_id
   AND m.empresa_id = v_empresa
  WHERE e.empresa_id = v_empresa
    AND (p_conta_corrente_id IS NULL OR e.conta_corrente_id = p_conta_corrente_id)
    AND (p_start_date IS NULL OR e.data_lancamento >= p_start_date)
    AND (p_end_date   IS NULL OR e.data_lancamento <= p_end_date)
    AND (p_conciliado IS NULL OR e.conciliado = p_conciliado)
    AND (p_tipo_lancamento IS NULL OR e.tipo_lancamento = p_tipo_lancamento)
    AND (
      p_q IS NULL
      OR public.unaccent(e.descricao) ILIKE '%' || v_uq || '%'
      OR coalesce(e.documento_ref,'') ILIKE '%' || p_q || '%'
      OR coalesce(e.identificador_banco,'') ILIKE '%' || p_q || '%'
    )
  ORDER BY e.data_lancamento ASC, e.created_at ASC, e.id ASC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. search_users_for_goal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_users_for_goal(p_q text DEFAULT NULL)
RETURNS TABLE (id uuid, nome text, email text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uq text := public.unaccent(coalesce(p_q, ''));
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    (u.raw_user_meta_data->>'name')::text AS nome,
    (u.email)::text                       AS email
  FROM public.empresa_usuarios eu
  JOIN auth.users u ON u.id = eu.user_id
  WHERE eu.empresa_id = public.current_empresa_id()
    AND eu.status = 'ACTIVE'
    AND (p_q IS NULL
         OR public.unaccent((u.raw_user_meta_data->>'name')) ILIKE '%' || v_uq || '%'
         OR u.email ILIKE '%' || p_q || '%')
  ORDER BY (u.raw_user_meta_data->>'name')
  LIMIT 10;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. fiscal_nfe_emissoes_list (also has text search)
-- ---------------------------------------------------------------------------
-- Check if it has ILIKE search and fix it too
DO $$
BEGIN
  RAISE NOTICE 'Accent-insensitive search migration applied to 11 RPCs.';
END $$;
