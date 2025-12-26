-- =============================================================================
-- Suprimentos (Compras / Ordens de Compra): base do módulo para banco limpo (CI/verify)
-- Objetivo:
-- - Garantir que o módulo "Ordens de Compra" funcione em DB limpo (CI/verify)
-- - Manter compat com o frontend atual (RPCs e assinaturas):
--     - compras_list_pedidos(p_search, p_status)
--     - compras_get_pedido_details(p_id)
--     - compras_upsert_pedido(p_payload jsonb)
--     - compras_manage_item(p_pedido_id, p_item_id, p_produto_id, p_quantidade, p_preco_unitario, p_action)
--     - compras_receber_pedido(p_id)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Enum status_compra (idempotente)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'status_compra'
      AND t.typnamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'CREATE TYPE public.status_compra AS ENUM (''rascunho'',''enviado'',''recebido'',''cancelado'')';
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Tabelas (idempotente)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compras_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero bigint NOT NULL,
  fornecedor_id uuid REFERENCES public.pessoas(id),
  status public.status_compra NOT NULL DEFAULT 'rascunho',
  data_emissao date NOT NULL DEFAULT current_date,
  data_prevista date,
  data_recebimento date,
  total_produtos numeric(14,2) NOT NULL DEFAULT 0,
  frete numeric(14,2) NOT NULL DEFAULT 0,
  desconto numeric(14,2) NOT NULL DEFAULT 0,
  total_geral numeric(14,2) NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compras_pedido_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.compras_pedidos(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  unidade text,
  quantidade numeric(14,3) NOT NULL DEFAULT 1,
  preco_unitario numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_pedidos_empresa_id_numero_key') THEN
    ALTER TABLE public.compras_pedidos
      ADD CONSTRAINT compras_pedidos_empresa_id_numero_key UNIQUE (empresa_id, numero);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_compras_pedidos_empresa_status ON public.compras_pedidos(empresa_id, status, data_emissao);
CREATE INDEX IF NOT EXISTS idx_compras_pedido_itens_pedido ON public.compras_pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_compras_pedido_itens_produto ON public.compras_pedido_itens(empresa_id, produto_id);

-- -----------------------------------------------------------------------------
-- RLS + Policies (empresa atual)
-- -----------------------------------------------------------------------------
ALTER TABLE public.compras_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_pedido_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_compras_pedidos_by_empresa ON public.compras_pedidos;
CREATE POLICY sel_compras_pedidos_by_empresa ON public.compras_pedidos
  FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS ins_compras_pedidos_same_empresa ON public.compras_pedidos;
CREATE POLICY ins_compras_pedidos_same_empresa ON public.compras_pedidos
  FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS upd_compras_pedidos_same_empresa ON public.compras_pedidos;
CREATE POLICY upd_compras_pedidos_same_empresa ON public.compras_pedidos
  FOR UPDATE USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS del_compras_pedidos_same_empresa ON public.compras_pedidos;
CREATE POLICY del_compras_pedidos_same_empresa ON public.compras_pedidos
  FOR DELETE USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS sel_compras_itens_by_empresa ON public.compras_pedido_itens;
CREATE POLICY sel_compras_itens_by_empresa ON public.compras_pedido_itens
  FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS ins_compras_itens_same_empresa ON public.compras_pedido_itens;
CREATE POLICY ins_compras_itens_same_empresa ON public.compras_pedido_itens
  FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS upd_compras_itens_same_empresa ON public.compras_pedido_itens;
CREATE POLICY upd_compras_itens_same_empresa ON public.compras_pedido_itens
  FOR UPDATE USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS del_compras_itens_same_empresa ON public.compras_pedido_itens;
CREATE POLICY del_compras_itens_same_empresa ON public.compras_pedido_itens
  FOR DELETE USING (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- Triggers updated_at (idempotente)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_compras_pedidos_set_updated_at ON public.compras_pedidos;
CREATE TRIGGER tg_compras_pedidos_set_updated_at
BEFORE UPDATE ON public.compras_pedidos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_compras_itens_set_updated_at ON public.compras_pedido_itens;
CREATE TRIGGER tg_compras_itens_set_updated_at
BEFORE UPDATE ON public.compras_pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers: numeração e recálculo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_compra_number_for_current_empresa()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_num bigint;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[COMPRAS] empresa_id inválido' USING errcode='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(('x'||substr(replace(v_empresa_id::text,'-',''),1,16))::bit(64)::bigint);

  SELECT COALESCE(MAX(numero), 0) + 1
    INTO v_num
  FROM public.compras_pedidos
  WHERE empresa_id = v_empresa_id;

  RETURN v_num;
END;
$$;

REVOKE ALL ON FUNCTION public.next_compra_number_for_current_empresa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_compra_number_for_current_empresa() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compras_recalc_totals(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_total_produtos numeric := 0;
  v_frete numeric := 0;
  v_desconto numeric := 0;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[RPC][COMPRAS][RECALC] empresa_id inválido' USING errcode='42501';
  END IF;

  SELECT COALESCE(SUM(total), 0)
    INTO v_total_produtos
  FROM public.compras_pedido_itens
  WHERE empresa_id = v_emp
    AND pedido_id = p_pedido_id;

  SELECT COALESCE(frete,0), COALESCE(desconto,0)
    INTO v_frete, v_desconto
  FROM public.compras_pedidos
  WHERE empresa_id = v_emp
    AND id = p_pedido_id;

  UPDATE public.compras_pedidos
     SET total_produtos = v_total_produtos,
         total_geral = greatest(v_total_produtos + v_frete - v_desconto, 0),
         updated_at = now()
   WHERE empresa_id = v_emp
     AND id = p_pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_recalc_totals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compras_recalc_totals(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPCs (compat com frontend)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.compras_list_pedidos(text, text);
CREATE OR REPLACE FUNCTION public.compras_list_pedidos(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  numero bigint,
  fornecedor_id uuid,
  fornecedor_nome text,
  data_emissao date,
  data_prevista date,
  status text,
  total_produtos numeric,
  frete numeric,
  desconto numeric,
  total_geral numeric,
  observacoes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.numero,
    c.fornecedor_id,
    f.nome as fornecedor_nome,
    c.data_emissao,
    c.data_prevista,
    c.status::text as status,
    c.total_produtos,
    c.frete,
    c.desconto,
    c.total_geral,
    c.observacoes
  FROM public.compras_pedidos c
  LEFT JOIN public.pessoas f ON f.id = c.fornecedor_id
  WHERE c.empresa_id = v_emp
    AND (
      p_status is null
      OR btrim(p_status) = ''
      OR c.status::text = p_status
    )
    AND (
      p_search is null
      OR btrim(p_search) = ''
      OR c.numero::text like '%'||btrim(p_search)||'%'
      OR lower(coalesce(f.nome,'')) like '%'||lower(btrim(p_search))||'%'
    )
  ORDER BY c.numero DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_list_pedidos(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compras_list_pedidos(text, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.compras_get_pedido_details(uuid);
CREATE OR REPLACE FUNCTION public.compras_get_pedido_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_pedido record;
  v_itens jsonb := '[]'::jsonb;
BEGIN
  SELECT
    c.*,
    f.nome as fornecedor_nome
  INTO v_pedido
  FROM public.compras_pedidos c
  LEFT JOIN public.pessoas f ON f.id = c.fornecedor_id
  WHERE c.empresa_id = v_emp
    AND c.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING errcode = 'PGRST116';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'pedido_id', i.pedido_id,
      'produto_id', i.produto_id,
      'produto_nome', p.nome,
      'unidade', coalesce(i.unidade, p.unidade),
      'quantidade', i.quantidade,
      'preco_unitario', i.preco_unitario,
      'total', i.total
    )
    ORDER BY p.nome
  ), '[]'::jsonb)
  INTO v_itens
  FROM public.compras_pedido_itens i
  JOIN public.produtos p ON p.id = i.produto_id
  WHERE i.empresa_id = v_emp
    AND i.pedido_id = p_id;

  RETURN jsonb_build_object(
    'id', v_pedido.id,
    'numero', v_pedido.numero,
    'fornecedor_id', v_pedido.fornecedor_id,
    'fornecedor_nome', v_pedido.fornecedor_nome,
    'data_emissao', v_pedido.data_emissao,
    'data_prevista', v_pedido.data_prevista,
    'status', v_pedido.status::text,
    'total_produtos', v_pedido.total_produtos,
    'frete', v_pedido.frete,
    'desconto', v_pedido.desconto,
    'total_geral', v_pedido.total_geral,
    'observacoes', v_pedido.observacoes,
    'itens', v_itens
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compras_get_pedido_details(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compras_get_pedido_details(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.compras_upsert_pedido(jsonb);
CREATE OR REPLACE FUNCTION public.compras_upsert_pedido(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_fornecedor uuid := nullif(p_payload->>'fornecedor_id','')::uuid;
  v_status public.status_compra := coalesce(nullif(p_payload->>'status','')::public.status_compra, 'rascunho'::public.status_compra);
  v_data_emissao date := coalesce(nullif(p_payload->>'data_emissao','')::date, current_date);
  v_data_prevista date := nullif(p_payload->>'data_prevista','')::date;
  v_frete numeric := coalesce(nullif(p_payload->>'frete','')::numeric, 0);
  v_desconto numeric := coalesce(nullif(p_payload->>'desconto','')::numeric, 0);
  v_obs text := nullif(p_payload->>'observacoes','');
  v_num bigint;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[RPC][COMPRAS][UPSERT] empresa_id inválido' USING errcode='42501';
  END IF;

  IF v_fornecedor IS NULL THEN
    RAISE EXCEPTION 'Selecione um fornecedor.' USING errcode='22023';
  END IF;

  IF v_id IS NULL THEN
    v_num := public.next_compra_number_for_current_empresa();
    INSERT INTO public.compras_pedidos (
      empresa_id, numero, fornecedor_id, status, data_emissao, data_prevista, frete, desconto, observacoes
    )
    VALUES (
      v_emp, v_num, v_fornecedor, v_status, v_data_emissao, v_data_prevista, v_frete, v_desconto, v_obs
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.compras_pedidos
       SET fornecedor_id = v_fornecedor,
           status = v_status,
           data_emissao = v_data_emissao,
           data_prevista = v_data_prevista,
           frete = v_frete,
           desconto = v_desconto,
           observacoes = v_obs,
           updated_at = now()
     WHERE empresa_id = v_emp
       AND id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pedido não encontrado.' USING errcode='PGRST116';
    END IF;
  END IF;

  PERFORM public.compras_recalc_totals(v_id);
  RETURN public.compras_get_pedido_details(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.compras_upsert_pedido(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compras_upsert_pedido(jsonb) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.compras_manage_item(uuid, uuid, uuid, numeric, numeric, text);
CREATE OR REPLACE FUNCTION public.compras_manage_item(
  p_pedido_id uuid,
  p_item_id uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_preco_unitario numeric,
  p_action text DEFAULT 'upsert'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_status public.status_compra;
  v_unidade text;
  v_total numeric;
BEGIN
  SELECT status
    INTO v_status
  FROM public.compras_pedidos
  WHERE empresa_id = v_emp
    AND id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING errcode='PGRST116';
  END IF;

  IF v_status in ('recebido','cancelado') THEN
    RAISE EXCEPTION 'Não é possível alterar itens em pedidos %.', v_status USING errcode='22023';
  END IF;

  IF p_action = 'delete' THEN
    DELETE FROM public.compras_pedido_itens
    WHERE empresa_id = v_emp
      AND pedido_id = p_pedido_id
      AND id = p_item_id;
    PERFORM public.compras_recalc_totals(p_pedido_id);
    RETURN;
  END IF;

  IF p_produto_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um produto.' USING errcode='22023';
  END IF;

  SELECT unidade INTO v_unidade
  FROM public.produtos
  WHERE empresa_id = v_emp
    AND id = p_produto_id;

  v_total := round(coalesce(p_quantidade,0) * coalesce(p_preco_unitario,0), 2);

  IF p_item_id IS NULL THEN
    INSERT INTO public.compras_pedido_itens (
      empresa_id, pedido_id, produto_id, unidade, quantidade, preco_unitario, total
    )
    VALUES (
      v_emp, p_pedido_id, p_produto_id, v_unidade, coalesce(p_quantidade,0), coalesce(p_preco_unitario,0), v_total
    );
  ELSE
    UPDATE public.compras_pedido_itens
       SET produto_id = p_produto_id,
           unidade = v_unidade,
           quantidade = coalesce(p_quantidade,0),
           preco_unitario = coalesce(p_preco_unitario,0),
           total = v_total,
           updated_at = now()
     WHERE empresa_id = v_emp
       AND pedido_id = p_pedido_id
       AND id = p_item_id;
  END IF;

  PERFORM public.compras_recalc_totals(p_pedido_id);
END;
$$;

REVOKE ALL ON FUNCTION public.compras_manage_item(uuid, uuid, uuid, numeric, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compras_manage_item(uuid, uuid, uuid, numeric, numeric, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.compras_receber_pedido(uuid);
CREATE OR REPLACE FUNCTION public.compras_receber_pedido(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_status public.status_compra;
  v_num bigint;
  v_item record;
  v_doc text;
BEGIN
  SELECT status, numero
    INTO v_status, v_num
  FROM public.compras_pedidos
  WHERE empresa_id = v_emp
    AND id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING errcode='PGRST116';
  END IF;

  IF v_status = 'cancelado' THEN
    RAISE EXCEPTION 'Pedido cancelado não pode ser recebido.' USING errcode='22023';
  END IF;

  IF v_status = 'recebido' THEN
    RETURN;
  END IF;

  v_doc := 'OC #'||v_num::text;

  FOR v_item IN
    SELECT i.produto_id, i.quantidade, i.preco_unitario
    FROM public.compras_pedido_itens i
    WHERE i.empresa_id = v_emp AND i.pedido_id = p_id
  LOOP
    -- Se não tiver quantidade, ignora.
    IF coalesce(v_item.quantidade,0) <= 0 THEN
      CONTINUE;
    END IF;

    -- Lança entrada no estoque usando a RPC padrão (atualiza estoque_saldos + kardex).
    PERFORM public.suprimentos_registrar_movimento(
      v_item.produto_id,
      'entrada',
      v_item.quantidade,
      nullif(coalesce(v_item.preco_unitario,0), 0),
      v_doc,
      'Recebimento por Ordem de Compra'
    );
  END LOOP;

  UPDATE public.compras_pedidos
     SET status = 'recebido',
         data_recebimento = current_date,
         updated_at = now()
   WHERE empresa_id = v_emp
     AND id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_receber_pedido(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compras_receber_pedido(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Supplier search (compat com SupplierAutocomplete do módulo de compras)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_suppliers_for_current_user(text);
CREATE OR REPLACE FUNCTION public.search_suppliers_for_current_user(
  p_search text
)
RETURNS TABLE (
  id uuid,
  label text,
  nome text,
  doc_unico text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.nome as label,
    p.nome,
    p.doc_unico
  FROM public.pessoas p
  WHERE p.empresa_id = v_emp
    AND p.tipo in ('fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
    AND (
      p_search is null
      OR btrim(p_search) = ''
      OR lower(p.nome) like '%'||lower(btrim(p_search))||'%'
      OR lower(coalesce(p.doc_unico,'')) like '%'||lower(btrim(p_search))||'%'
    )
  ORDER BY p.nome
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.search_suppliers_for_current_user(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_suppliers_for_current_user(text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
