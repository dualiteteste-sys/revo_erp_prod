-- Fix: set search_path = pg_catalog, public on all NF-e Destinadas SECURITY DEFINER functions
-- RG-03 SEC-02b requires pg_catalog prefix for safety
BEGIN;

-- 0. Drop old 3-param overload of manifestar (superseded by 6-param version in migration 20270311160000)
DROP FUNCTION IF EXISTS public.fiscal_nfe_destinadas_manifestar(uuid[], text, text);

-- 1. fiscal_nfe_destinadas_list
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_list(
  p_status      text    DEFAULT NULL,
  p_start_date  text    DEFAULT NULL,
  p_end_date    text    DEFAULT NULL,
  p_cnpj_emitente text  DEFAULT NULL,
  p_search      text    DEFAULT NULL,
  p_page        int     DEFAULT 1,
  p_page_size   int     DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_eid uuid := public.current_empresa_id();
  v_offset int;
  v_total bigint;
  v_rows jsonb;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  v_offset := GREATEST(0, (COALESCE(p_page, 1) - 1)) * COALESCE(p_page_size, 50);

  SELECT count(*) INTO v_total
  FROM public.fiscal_nfe_destinadas d
  WHERE d.empresa_id = v_eid
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_start_date IS NULL OR d.data_emissao >= p_start_date::timestamptz)
    AND (p_end_date IS NULL OR d.data_emissao < (p_end_date::date + 1)::timestamptz)
    AND (p_cnpj_emitente IS NULL OR d.cnpj_emitente = p_cnpj_emitente)
    AND (p_search IS NULL OR p_search = '' OR
         d.nome_emitente ILIKE '%' || p_search || '%' OR
         d.chave_acesso ILIKE '%' || p_search || '%' OR
         d.cnpj_emitente ILIKE '%' || p_search || '%');

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.data_emissao DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      d.id,
      d.chave_acesso,
      d.nsu,
      d.cnpj_emitente,
      d.nome_emitente,
      d.ie_emitente,
      d.data_emissao,
      d.tipo_nfe,
      d.valor_nf,
      d.protocolo,
      d.situacao_nfe,
      d.status,
      d.manifestado_em,
      d.justificativa,
      d.fornecedor_id,
      d.conta_pagar_id,
      d.recebimento_id,
      d.pedido_compra_id,
      d.xml_resumo_path,
      d.xml_completo_path,
      d.xml_evento_path,
      d.prazo_ciencia,
      d.prazo_manifestacao,
      d.created_at,
      d.updated_at,
      p2.nome AS fornecedor_nome
    FROM public.fiscal_nfe_destinadas d
    LEFT JOIN public.pessoas p2 ON p2.id = d.fornecedor_id
    WHERE d.empresa_id = v_eid
      AND (p_status IS NULL OR d.status = p_status)
      AND (p_start_date IS NULL OR d.data_emissao >= p_start_date::timestamptz)
      AND (p_end_date IS NULL OR d.data_emissao < (p_end_date::date + 1)::timestamptz)
      AND (p_cnpj_emitente IS NULL OR d.cnpj_emitente = p_cnpj_emitente)
      AND (p_search IS NULL OR p_search = '' OR
           d.nome_emitente ILIKE '%' || p_search || '%' OR
           d.chave_acesso ILIKE '%' || p_search || '%' OR
           d.cnpj_emitente ILIKE '%' || p_search || '%')
    ORDER BY d.data_emissao DESC
    LIMIT COALESCE(p_page_size, 50) OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page', COALESCE(p_page, 1),
    'page_size', COALESCE(p_page_size, 50)
  );
END;
$$;

-- 2. fiscal_nfe_destinadas_summary
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_eid uuid := public.current_empresa_id();
  v_result jsonb;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  SELECT jsonb_build_object(
    'pendentes',    count(*) FILTER (WHERE status = 'pendente'),
    'ciencia',      count(*) FILTER (WHERE status = 'ciencia'),
    'confirmadas',  count(*) FILTER (WHERE status = 'confirmada'),
    'desconhecidas',count(*) FILTER (WHERE status = 'desconhecida'),
    'nao_realizadas',count(*) FILTER (WHERE status = 'nao_realizada'),
    'ignoradas',    count(*) FILTER (WHERE status = 'ignorada'),
    'total',        count(*),
    'valor_total',  COALESCE(sum(valor_nf), 0)
  ) INTO v_result
  FROM public.fiscal_nfe_destinadas
  WHERE empresa_id = v_eid;

  RETURN v_result;
END;
$$;

-- 3. fiscal_nfe_destinadas_sync_status
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_sync_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_eid uuid := public.current_empresa_id();
  v_row record;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  SELECT * INTO v_row
  FROM public.fiscal_nfe_destinadas_sync
  WHERE empresa_id = v_eid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ultimo_nsu', 0,
      'max_nsu', 0,
      'last_sync_at', null,
      'last_sync_status', null,
      'synced', false
    );
  END IF;

  RETURN jsonb_build_object(
    'ultimo_nsu', v_row.ultimo_nsu,
    'max_nsu', v_row.max_nsu,
    'last_sync_at', v_row.last_sync_at,
    'last_sync_status', v_row.last_sync_status,
    'last_sync_error', v_row.last_sync_error,
    'synced', v_row.ultimo_nsu >= v_row.max_nsu AND v_row.max_nsu > 0
  );
END;
$$;

-- 4. fiscal_nfe_destinadas_upsert
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_upsert(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_eid uuid := public.current_empresa_id();
  v_id uuid;
  v_data_emissao timestamptz;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  v_data_emissao := (p_row->>'data_emissao')::timestamptz;

  INSERT INTO public.fiscal_nfe_destinadas (
    empresa_id,
    chave_acesso,
    nsu,
    cnpj_emitente,
    nome_emitente,
    ie_emitente,
    data_emissao,
    tipo_nfe,
    valor_nf,
    protocolo,
    situacao_nfe,
    xml_resumo_path,
    prazo_ciencia,
    prazo_manifestacao
  ) VALUES (
    v_eid,
    p_row->>'chave_acesso',
    (p_row->>'nsu')::bigint,
    p_row->>'cnpj_emitente',
    p_row->>'nome_emitente',
    p_row->>'ie_emitente',
    v_data_emissao,
    (p_row->>'tipo_nfe')::smallint,
    (p_row->>'valor_nf')::numeric,
    p_row->>'protocolo',
    (p_row->>'situacao_nfe')::smallint,
    p_row->>'xml_resumo_path',
    v_data_emissao + interval '10 days',
    v_data_emissao + interval '180 days'
  )
  ON CONFLICT (empresa_id, chave_acesso) DO UPDATE SET
    nsu              = GREATEST(public.fiscal_nfe_destinadas.nsu, EXCLUDED.nsu),
    nome_emitente    = COALESCE(EXCLUDED.nome_emitente, public.fiscal_nfe_destinadas.nome_emitente),
    ie_emitente      = COALESCE(EXCLUDED.ie_emitente, public.fiscal_nfe_destinadas.ie_emitente),
    valor_nf         = EXCLUDED.valor_nf,
    protocolo        = COALESCE(EXCLUDED.protocolo, public.fiscal_nfe_destinadas.protocolo),
    situacao_nfe     = COALESCE(EXCLUDED.situacao_nfe, public.fiscal_nfe_destinadas.situacao_nfe),
    xml_resumo_path  = COALESCE(EXCLUDED.xml_resumo_path, public.fiscal_nfe_destinadas.xml_resumo_path),
    updated_at       = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- 5. fiscal_nfe_destinadas_manifestar (already recreated in 20270311160000 but with search_path = public)
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_manifestar(
  p_ids uuid[],
  p_status text,
  p_justificativa text DEFAULT NULL,
  p_evento_protocolo text DEFAULT NULL,
  p_evento_cstat text DEFAULT NULL,
  p_evento_dh_registro timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_updated int := 0;
  v_terminal_states text[] := ARRAY['confirmada','desconhecida','nao_realizada'];
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_REQUIRED';
  END IF;

  IF p_status NOT IN ('pendente','ciencia','confirmada','desconhecida','nao_realizada','ignorada') THEN
    RAISE EXCEPTION 'INVALID_STATUS: %', p_status;
  END IF;

  IF p_status = 'nao_realizada' THEN
    IF p_justificativa IS NULL OR length(trim(p_justificativa)) < 15 THEN
      RAISE EXCEPTION 'JUSTIFICATIVA_REQUIRED: mínimo 15 caracteres';
    END IF;
    IF length(trim(p_justificativa)) > 255 THEN
      RAISE EXCEPTION 'JUSTIFICATIVA_TOO_LONG: máximo 255 caracteres';
    END IF;
  END IF;

  UPDATE public.fiscal_nfe_destinadas
  SET
    status = p_status,
    manifestado_em = CASE
      WHEN p_status IN ('ciencia','confirmada','desconhecida','nao_realizada') THEN now()
      ELSE manifestado_em
    END,
    justificativa = CASE
      WHEN p_status = 'nao_realizada' THEN trim(p_justificativa)
      ELSE justificativa
    END,
    evento_protocolo = COALESCE(p_evento_protocolo, evento_protocolo),
    evento_cstat = COALESCE(p_evento_cstat, evento_cstat),
    evento_dh_registro = COALESCE(p_evento_dh_registro, evento_dh_registro),
    updated_at = now()
  WHERE id = ANY(p_ids)
    AND empresa_id = v_empresa
    AND status != ALL(v_terminal_states);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'total', array_length(p_ids, 1)
  );
END;
$$;

COMMIT;
