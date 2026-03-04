-- ============================================================================
-- feat: Lote rastreável — NF-e XML → fiscal_nfe_import_items → recebimento_itens
--       → estoque_movimentos → estoque_lotes
-- ============================================================================
-- Scope:
--   1. fiscal_nfe_import_items: + n_lote, d_fab, d_val  (do XML <rastro>)
--   2. recebimento_itens: + lote, data_fabricacao, data_validade
--   3. fiscal_nfe_import_register: salva n_lote, d_fab, d_val do payload
--   4. create_recebimento_from_xml: copia lote do import para recebimento_itens
--   5. beneficiamento_process_from_import: propaga lote → estoque_movimentos
--      + upsert estoque_lotes com saldo e validade
--   6. suprimentos_get_kardex / _v2: retornam coluna lote
-- ============================================================================

-- ============================================================================
-- 1. Colunas em fiscal_nfe_import_items
-- ============================================================================
ALTER TABLE public.fiscal_nfe_import_items
  ADD COLUMN IF NOT EXISTS n_lote text,  -- número do lote (<rastro><nLote>)
  ADD COLUMN IF NOT EXISTS d_fab  date,  -- data fabricação (<rastro><dFab>)
  ADD COLUMN IF NOT EXISTS d_val  date;  -- data validade  (<rastro><dVal>)

-- ============================================================================
-- 2. Colunas em recebimento_itens
-- ============================================================================
ALTER TABLE public.recebimento_itens
  ADD COLUMN IF NOT EXISTS lote             text,
  ADD COLUMN IF NOT EXISTS data_fabricacao  date,
  ADD COLUMN IF NOT EXISTS data_validade    date;

-- ============================================================================
-- 3. fiscal_nfe_import_register — salva campos de lote do payload
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fiscal_nfe_import_register(
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp     uuid := public.current_empresa_id();
  v_id      uuid;
  v_chave   text := trim(coalesce(p_payload->>'chave_acesso',''));
  v_items   jsonb := coalesce(p_payload->'items','[]'::jsonb);
  v_it      jsonb;
BEGIN
  IF v_chave = '' THEN
    RAISE EXCEPTION 'chave_acesso é obrigatória.';
  END IF;

  INSERT INTO public.fiscal_nfe_imports (
    empresa_id, origem_upload, chave_acesso,
    numero, serie, emitente_cnpj, emitente_nome,
    destinat_cnpj, destinat_nome, data_emissao,
    total_produtos, total_nf, xml_raw, status, last_error
  ) VALUES (
    v_emp,
    coalesce(p_payload->>'origem_upload','xml'),
    v_chave,
    p_payload->>'numero',
    p_payload->>'serie',
    p_payload->>'emitente_cnpj',
    p_payload->>'emitente_nome',
    p_payload->>'destinat_cnpj',
    p_payload->>'destinat_nome',
    (p_payload->>'data_emissao')::timestamptz,
    (p_payload->>'total_produtos')::numeric,
    (p_payload->>'total_nf')::numeric,
    p_payload->>'xml_raw',
    'registrado',
    null
  )
  ON CONFLICT (empresa_id, chave_acesso) DO UPDATE SET
    origem_upload  = excluded.origem_upload,
    numero         = excluded.numero,
    serie          = excluded.serie,
    emitente_cnpj  = excluded.emitente_cnpj,
    emitente_nome  = excluded.emitente_nome,
    destinat_cnpj  = excluded.destinat_cnpj,
    destinat_nome  = excluded.destinat_nome,
    data_emissao   = excluded.data_emissao,
    total_produtos = excluded.total_produtos,
    total_nf       = excluded.total_nf,
    xml_raw        = excluded.xml_raw,
    status         = 'registrado',
    last_error     = null,
    updated_at     = now()
  RETURNING id INTO v_id;

  DELETE FROM public.fiscal_nfe_import_items
  WHERE empresa_id = v_emp AND import_id = v_id;

  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    INSERT INTO public.fiscal_nfe_import_items (
      empresa_id, import_id, n_item, cprod, ean, xprod, ncm, cfop,
      ucom, qcom, vuncom, vprod, cst, utrib, qtrib, vuntrib,
      n_lote, d_fab, d_val
    ) VALUES (
      v_emp, v_id,
      (v_it->>'n_item')::int,
      v_it->>'cprod',
      v_it->>'ean',
      v_it->>'xprod',
      v_it->>'ncm',
      v_it->>'cfop',
      v_it->>'ucom',
      (v_it->>'qcom')::numeric,
      (v_it->>'vuncom')::numeric,
      (v_it->>'vprod')::numeric,
      v_it->>'cst',
      v_it->>'utrib',
      (v_it->>'qtrib')::numeric,
      (v_it->>'vuntrib')::numeric,
      nullif(trim(coalesce(v_it->>'n_lote','')), ''),
      nullif(trim(coalesce(v_it->>'d_fab','')), '')::date,
      nullif(trim(coalesce(v_it->>'d_val','')), '')::date
    );
  END LOOP;

  PERFORM pg_notify('app_log', '[RPC] fiscal_nfe_import_register: '||v_id);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_import_register FROM public;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_import_register TO authenticated, service_role;

-- ============================================================================
-- 4. _create_recebimento_from_xml — copia lote do import para recebimento_itens
--    NOTA: a função pública create_recebimento_from_xml é um thin wrapper criado
--    por _sec_mt02_wrap_guard em 20270102200000 que adiciona permission guard.
--    Aqui atualizamos a implementação subjacente (_create_recebimento_from_xml).
-- ============================================================================
CREATE OR REPLACE FUNCTION public._create_recebimento_from_xml(
  p_import_id uuid
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
BEGIN
  SELECT id INTO v_recebimento_id
  FROM public.recebimentos
  WHERE fiscal_nfe_import_id = p_import_id AND empresa_id = v_emp;

  IF v_recebimento_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_recebimento_id, 'status', 'exists');
  END IF;

  INSERT INTO public.recebimentos (empresa_id, fiscal_nfe_import_id, status)
  VALUES (v_emp, p_import_id, 'pendente')
  RETURNING id INTO v_recebimento_id;

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

  RETURN jsonb_build_object('id', v_recebimento_id, 'status', 'created');
END;
$$;

REVOKE ALL ON FUNCTION public._create_recebimento_from_xml(uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public._create_recebimento_from_xml(uuid) TO service_role;

-- ============================================================================
-- 5. beneficiamento_process_from_import — propaga lote → estoque
-- ============================================================================
CREATE OR REPLACE FUNCTION public.beneficiamento_process_from_import(
  p_import_id uuid,
  p_matches   jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp   uuid := public.current_empresa_id();
  v_stat  text;
  v_row   record;
  v_prod  uuid;
  v_lote  text;
BEGIN
  SELECT status INTO v_stat
  FROM public.fiscal_nfe_imports
  WHERE id = p_import_id AND empresa_id = v_emp
  FOR UPDATE;

  IF v_stat IS NULL THEN
    RAISE EXCEPTION 'Import não encontrado.';
  END IF;

  IF v_stat = 'processado' THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT fi.*
    FROM public.fiscal_nfe_import_items fi
    WHERE fi.import_id = p_import_id AND fi.empresa_id = v_emp
    ORDER BY fi.n_item
  LOOP
    SELECT p.id INTO v_prod
    FROM public.produtos p
    WHERE (p.sku = v_row.cprod AND v_row.cprod IS NOT NULL AND v_row.cprod <> '')
       OR (p.gtin = v_row.ean AND v_row.ean IS NOT NULL AND v_row.ean <> '')
    LIMIT 1;

    IF v_prod IS NULL AND p_matches IS NOT NULL THEN
      SELECT (m->>'produto_id')::uuid INTO v_prod
      FROM jsonb_array_elements(p_matches) m
      WHERE (m->>'item_id')::uuid = v_row.id;
    END IF;

    IF v_prod IS NULL THEN
      RAISE EXCEPTION 'Item % sem mapeamento de produto. Utilize preview e envie p_matches.', v_row.n_item;
    END IF;

    v_lote := coalesce(nullif(trim(coalesce(v_row.n_lote,'')), ''), 'SEM_LOTE');

    INSERT INTO public.estoque_movimentos (
      empresa_id, produto_id, data_movimento,
      tipo_mov, quantidade, valor_unitario,
      origem_tipo, origem_id, lote, observacoes
    ) VALUES (
      v_emp, v_prod, current_date,
      'entrada_beneficiamento', v_row.qcom, v_row.vuncom,
      'nfe_beneficiamento', p_import_id,
      v_lote,
      'NF-e entrada para beneficiamento - chave='||(
        SELECT chave_acesso FROM public.fiscal_nfe_imports WHERE id = p_import_id
      )
    )
    ON CONFLICT (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov) DO UPDATE SET
      quantidade     = excluded.quantidade,
      valor_unitario = excluded.valor_unitario,
      lote           = excluded.lote,
      updated_at     = now();

    -- Upsert no estoque_lotes com saldo e data de validade
    INSERT INTO public.estoque_lotes (empresa_id, produto_id, lote, saldo, validade)
    VALUES (v_emp, v_prod, v_lote, v_row.qcom, v_row.d_val)
    ON CONFLICT (empresa_id, produto_id, lote)
    DO UPDATE SET
      saldo      = public.estoque_lotes.saldo + excluded.saldo,
      validade   = coalesce(excluded.validade, public.estoque_lotes.validade),
      updated_at = now();
  END LOOP;

  UPDATE public.fiscal_nfe_imports
  SET status = 'processado', processed_at = now(), last_error = null
  WHERE id = p_import_id AND empresa_id = v_emp;

  PERFORM pg_notify('app_log', '[RPC] beneficiamento_process_from_import: '||p_import_id);
EXCEPTION
  WHEN others THEN
    UPDATE public.fiscal_nfe_imports
    SET status = 'erro', last_error = sqlerrm, updated_at = now()
    WHERE id = p_import_id AND empresa_id = v_emp;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.beneficiamento_process_from_import FROM public;
GRANT EXECUTE ON FUNCTION public.beneficiamento_process_from_import TO authenticated, service_role;

-- ============================================================================
-- 6a. suprimentos_get_kardex — adiciona coluna lote
-- ============================================================================
DROP FUNCTION IF EXISTS public.suprimentos_get_kardex(uuid, integer);
CREATE OR REPLACE FUNCTION public.suprimentos_get_kardex(
  p_produto_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id            uuid,
  tipo          text,
  quantidade    numeric,
  saldo_anterior numeric,
  saldo_novo    numeric,
  documento_ref text,
  observacao    text,
  created_at    timestamptz,
  usuario_email text,
  lote          text
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
    m.id,
    coalesce(m.tipo, m.tipo_mov, 'ajuste') AS tipo,
    coalesce(m.quantidade, 0) AS quantidade,
    coalesce(m.saldo_anterior, 0) AS saldo_anterior,
    coalesce(m.saldo_atual, 0) AS saldo_novo,
    nullif(m.origem::text, '') AS documento_ref,
    nullif(m.observacoes, '') AS observacao,
    m.created_at,
    null::text AS usuario_email,
    m.lote
  FROM public.estoque_movimentos m
  WHERE m.empresa_id = v_emp
    AND m.produto_id = p_produto_id
  ORDER BY m.created_at DESC
  LIMIT greatest(coalesce(p_limit, 50), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.suprimentos_get_kardex(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.suprimentos_get_kardex(uuid, integer) TO authenticated, service_role;

-- ============================================================================
-- 6b. suprimentos_get_kardex_v2 — adiciona coluna lote
-- ============================================================================
DROP FUNCTION IF EXISTS public.suprimentos_get_kardex_v2(uuid, uuid, integer);
CREATE OR REPLACE FUNCTION public.suprimentos_get_kardex_v2(
  p_produto_id  uuid,
  p_deposito_id uuid DEFAULT null,
  p_limit       integer DEFAULT 50
)
RETURNS TABLE (
  id            uuid,
  tipo          text,
  quantidade    numeric,
  saldo_anterior numeric,
  saldo_novo    numeric,
  documento_ref text,
  observacao    text,
  created_at    timestamptz,
  usuario_email text,
  deposito_id   uuid,
  deposito_nome text,
  lote          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_dep uuid := coalesce(p_deposito_id, public.suprimentos_default_deposito_ensure());
BEGIN
  PERFORM public.require_plano_mvp_allows('suprimentos');
  PERFORM public.require_permission_for_current_user('estoque','view');

  IF NOT public.suprimentos_deposito_can_view(v_dep) THEN
    RAISE EXCEPTION '[SUP][DEP] sem acesso ao depósito' USING errcode='42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    coalesce(m.tipo, m.tipo_mov, 'ajuste') AS tipo,
    coalesce(m.quantidade, 0) AS quantidade,
    coalesce(m.saldo_anterior, 0) AS saldo_anterior,
    coalesce(m.saldo_atual, 0) AS saldo_novo,
    nullif(m.origem::text, '') AS documento_ref,
    nullif(m.observacoes, '') AS observacao,
    m.created_at,
    null::text AS usuario_email,
    m.deposito_id,
    d.nome AS deposito_nome,
    m.lote
  FROM public.estoque_movimentos m
  LEFT JOIN public.estoque_depositos d
    ON d.id = m.deposito_id AND d.empresa_id = v_emp
  WHERE m.empresa_id = v_emp
    AND m.produto_id = p_produto_id
    AND coalesce(m.deposito_id, v_dep) = v_dep
  ORDER BY m.created_at DESC
  LIMIT greatest(coalesce(p_limit, 50), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.suprimentos_get_kardex_v2(uuid, uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.suprimentos_get_kardex_v2(uuid, uuid, integer) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'feat: lote rastreável ativado — fiscal_nfe_import_items + recebimento_itens + kardex.';
END $$;
