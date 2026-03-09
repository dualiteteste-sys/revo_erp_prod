/*
  SUP: Vincular fornecedor ao recebimento de NF-e

  - Adiciona coluna fornecedor_id na tabela recebimentos
  - Atualiza _create_recebimento_from_xml para aceitar e salvar fornecedor_id
  - Atualiza wrapper público create_recebimento_from_xml (mesma mudança)
  - Atualiza RPCs de listagem/detalhe para retornar fornecedor_nome
*/

BEGIN;

-- =============================================================================
-- 1) Coluna fornecedor_id na tabela recebimentos
-- =============================================================================
ALTER TABLE public.recebimentos
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL;

-- =============================================================================
-- 2) Recriar _create_recebimento_from_xml com p_fornecedor_id
--    (implementação interna, service_role only)
-- =============================================================================
DROP FUNCTION IF EXISTS public._create_recebimento_from_xml(uuid);

CREATE OR REPLACE FUNCTION public._create_recebimento_from_xml(
  p_import_id     uuid,
  p_fornecedor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp            uuid := public.current_empresa_id();
  v_recebimento_id uuid;
  v_item           record;
  v_prod_id        uuid;
  v_status         text := 'created';
  v_items_count    int  := 0;
BEGIN
  SELECT id INTO v_recebimento_id
  FROM public.recebimentos
  WHERE fiscal_nfe_import_id = p_import_id AND empresa_id = v_emp;

  IF v_recebimento_id IS NOT NULL THEN
    -- Atualizar fornecedor_id se passado (mesmo em recebimento existente)
    IF p_fornecedor_id IS NOT NULL THEN
      UPDATE public.recebimentos
      SET fornecedor_id = p_fornecedor_id, updated_at = now()
      WHERE id = v_recebimento_id AND empresa_id = v_emp;
    END IF;

    -- Verifica se itens ainda existem (podem ter sido cascade-deletados)
    SELECT count(*) INTO v_items_count
    FROM public.recebimento_itens
    WHERE recebimento_id = v_recebimento_id AND empresa_id = v_emp;

    IF v_items_count > 0 THEN
      RETURN jsonb_build_object('id', v_recebimento_id, 'status', 'exists');
    END IF;

    -- Itens cascade-deletados: recria
    v_status := 'reopened';
  ELSE
    INSERT INTO public.recebimentos (empresa_id, fiscal_nfe_import_id, fornecedor_id, status)
    VALUES (v_emp, p_import_id, p_fornecedor_id, 'pendente')
    RETURNING id INTO v_recebimento_id;
  END IF;

  FOR v_item IN
    SELECT * FROM public.fiscal_nfe_import_items
    WHERE import_id = p_import_id AND empresa_id = v_emp
  LOOP
    SELECT id INTO v_prod_id
    FROM public.produtos p
    WHERE p.empresa_id = v_emp
      AND (
        (p.sku = v_item.cprod AND coalesce(v_item.cprod,'') <> '') OR
        (p.gtin = v_item.ean AND coalesce(v_item.ean,'') <> '')
      )
    LIMIT 1;

    INSERT INTO public.recebimento_itens (
      empresa_id, recebimento_id, fiscal_nfe_item_id, produto_id, quantidade_xml,
      lote, data_fabricacao, data_validade
    ) VALUES (
      v_emp, v_recebimento_id, v_item.id, v_prod_id, v_item.qcom,
      v_item.n_lote, v_item.d_fab, v_item.d_val
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_recebimento_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public._create_recebimento_from_xml(uuid, uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public._create_recebimento_from_xml(uuid, uuid) TO service_role;

-- =============================================================================
-- 3) Recriar wrapper público create_recebimento_from_xml
--    (permission guard + delega para a interna)
-- =============================================================================
DROP FUNCTION IF EXISTS public.create_recebimento_from_xml(uuid);

CREATE OR REPLACE FUNCTION public.create_recebimento_from_xml(
  p_import_id     uuid,
  p_fornecedor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('suprimentos', 'create');
  RETURN public._create_recebimento_from_xml(p_import_id, p_fornecedor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_recebimento_from_xml(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_recebimento_from_xml(uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- 4) Atualizar suprimentos_recebimentos_list para incluir fornecedor
-- =============================================================================
CREATE OR REPLACE FUNCTION public.suprimentos_recebimentos_list(
  p_status text DEFAULT NULL
)
RETURNS setof jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_plano_mvp_allows('suprimentos');
  PERFORM public.require_permission_for_current_user('suprimentos','view');

  RETURN QUERY
  SELECT
    jsonb_strip_nulls(
      to_jsonb(r) ||
      jsonb_build_object(
        'fornecedor_nome', f.nome,
        'fiscal_nfe_imports',
        CASE
          WHEN i.id IS NULL THEN NULL
          ELSE jsonb_strip_nulls(jsonb_build_object(
            'chave_acesso', i.chave_acesso,
            'emitente_nome', i.emitente_nome,
            'emitente_cnpj', i.emitente_cnpj,
            'numero', i.numero,
            'serie', i.serie,
            'total_nf', i.total_nf,
            'pedido_numero', i.pedido_numero
          ))
        END
      )
    )
  FROM public.recebimentos r
  LEFT JOIN public.fiscal_nfe_imports i ON i.id = r.fiscal_nfe_import_id
  LEFT JOIN public.pessoas f ON f.id = r.fornecedor_id
  WHERE r.empresa_id = public.current_empresa_id()
    AND (p_status IS NULL OR r.status = p_status)
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.suprimentos_recebimentos_list(text) FROM public;
GRANT EXECUTE ON FUNCTION public.suprimentos_recebimentos_list(text) TO authenticated, service_role;

-- =============================================================================
-- 5) Atualizar suprimentos_recebimento_get para incluir fornecedor
-- =============================================================================
CREATE OR REPLACE FUNCTION public.suprimentos_recebimento_get(
  p_recebimento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  PERFORM public.require_plano_mvp_allows('suprimentos');
  PERFORM public.require_permission_for_current_user('suprimentos','view');

  SELECT
    jsonb_strip_nulls(
      to_jsonb(r) ||
      jsonb_build_object(
        'fornecedor_nome', f.nome,
        'fiscal_nfe_imports',
        CASE
          WHEN i.id IS NULL THEN NULL
          ELSE jsonb_strip_nulls(jsonb_build_object(
            'chave_acesso', i.chave_acesso,
            'emitente_nome', i.emitente_nome,
            'emitente_cnpj', i.emitente_cnpj,
            'numero', i.numero,
            'serie', i.serie,
            'total_nf', i.total_nf,
            'pedido_numero', i.pedido_numero
          ))
        END
      )
    )
  INTO v_row
  FROM public.recebimentos r
  LEFT JOIN public.fiscal_nfe_imports i ON i.id = r.fiscal_nfe_import_id
  LEFT JOIN public.pessoas f ON f.id = r.fornecedor_id
  WHERE r.id = p_recebimento_id
    AND r.empresa_id = public.current_empresa_id();

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Recebimento não encontrado.' USING errcode = 'P0001';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.suprimentos_recebimento_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.suprimentos_recebimento_get(uuid) TO authenticated, service_role;

COMMIT;
