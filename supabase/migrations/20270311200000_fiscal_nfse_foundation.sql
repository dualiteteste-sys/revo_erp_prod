-- NFS-e (Nota Fiscal de Serviço Eletrônica) foundation tables + RPCs
BEGIN;

-- 1. Main NFS-e emissions table
CREATE TABLE IF NOT EXISTS public.fiscal_nfse_emissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),

  -- Status: rascunho, processando, autorizada, rejeitada, cancelada, erro
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','processando','autorizada','rejeitada','cancelada','erro')),

  -- NFS-e identification (filled after authorization)
  numero text,
  codigo_verificacao text,
  url_nota text,

  -- Tomador (service recipient)
  tomador_pessoa_id uuid REFERENCES public.pessoas(id),

  -- Service details
  discriminacao text NOT NULL DEFAULT '',
  valor_servicos numeric(15,2) NOT NULL DEFAULT 0,
  valor_deducoes numeric(15,2) DEFAULT 0,
  valor_iss numeric(15,2) DEFAULT 0,
  iss_retido boolean DEFAULT false,
  aliquota_iss numeric(7,4) DEFAULT 0,

  -- LC116 service code
  item_lista_servico text,

  -- Location
  codigo_municipio text,
  municipio_prestacao text,
  uf_prestacao text DEFAULT 'SP',

  -- Fiscal
  natureza_operacao text DEFAULT '1',
  regime_especial_tributacao text,
  optante_simples_nacional boolean DEFAULT true,
  incentivador_cultural boolean DEFAULT false,

  -- Provider integration
  ambiente text DEFAULT 'homologacao',
  last_error text,
  payload jsonb,
  focusnfe_ref text,

  -- Documents
  pdf_url text,
  xml_url text,

  -- Cancellation
  cancelada_em timestamptz,
  cancelamento_justificativa text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nfse_emissoes_empresa_status
  ON public.fiscal_nfse_emissoes(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_nfse_emissoes_empresa_created
  ON public.fiscal_nfse_emissoes(empresa_id, created_at DESC);

ALTER TABLE public.fiscal_nfse_emissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nfse_emissoes_tenant ON public.fiscal_nfse_emissoes
  FOR ALL USING (empresa_id = public.current_empresa_id());

GRANT SELECT, INSERT, UPDATE ON public.fiscal_nfse_emissoes TO authenticated;

-- 2. RPC: List NFS-e emissoes with pagination
CREATE OR REPLACE FUNCTION public.fiscal_nfse_emissoes_list(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 50
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
  FROM public.fiscal_nfse_emissoes e
  WHERE e.empresa_id = v_eid
    AND (p_status IS NULL OR e.status = p_status)
    AND (p_search IS NULL OR p_search = '' OR
         e.discriminacao ILIKE '%' || p_search || '%' OR
         e.numero ILIKE '%' || p_search || '%');

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      e.id,
      e.status,
      e.numero,
      e.codigo_verificacao,
      e.url_nota,
      e.tomador_pessoa_id,
      e.discriminacao,
      e.valor_servicos,
      e.iss_retido,
      e.aliquota_iss,
      e.item_lista_servico,
      e.codigo_municipio,
      e.ambiente,
      e.last_error,
      e.pdf_url,
      e.xml_url,
      e.cancelada_em,
      e.created_at,
      e.updated_at,
      p.nome AS tomador_nome,
      p.doc_unico AS tomador_doc
    FROM public.fiscal_nfse_emissoes e
    LEFT JOIN public.pessoas p ON p.id = e.tomador_pessoa_id
    WHERE e.empresa_id = v_eid
      AND (p_status IS NULL OR e.status = p_status)
      AND (p_search IS NULL OR p_search = '' OR
           e.discriminacao ILIKE '%' || p_search || '%' OR
           e.numero ILIKE '%' || p_search || '%')
    ORDER BY e.created_at DESC
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

GRANT EXECUTE ON FUNCTION public.fiscal_nfse_emissoes_list(text, text, int, int) TO authenticated;

-- 3. RPC: Upsert NFS-e draft
CREATE OR REPLACE FUNCTION public.fiscal_nfse_emissao_draft_upsert(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_eid uuid := public.current_empresa_id();
  v_id uuid;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  v_id := (p_data->>'id')::uuid;

  IF v_id IS NOT NULL THEN
    -- Update existing draft
    UPDATE public.fiscal_nfse_emissoes SET
      tomador_pessoa_id = COALESCE((p_data->>'tomador_pessoa_id')::uuid, tomador_pessoa_id),
      discriminacao = COALESCE(p_data->>'discriminacao', discriminacao),
      valor_servicos = COALESCE((p_data->>'valor_servicos')::numeric, valor_servicos),
      valor_deducoes = COALESCE((p_data->>'valor_deducoes')::numeric, valor_deducoes),
      iss_retido = COALESCE((p_data->>'iss_retido')::boolean, iss_retido),
      aliquota_iss = COALESCE((p_data->>'aliquota_iss')::numeric, aliquota_iss),
      item_lista_servico = COALESCE(p_data->>'item_lista_servico', item_lista_servico),
      codigo_municipio = COALESCE(p_data->>'codigo_municipio', codigo_municipio),
      municipio_prestacao = COALESCE(p_data->>'municipio_prestacao', municipio_prestacao),
      uf_prestacao = COALESCE(p_data->>'uf_prestacao', uf_prestacao),
      natureza_operacao = COALESCE(p_data->>'natureza_operacao', natureza_operacao),
      updated_at = now()
    WHERE id = v_id
      AND empresa_id = v_eid
      AND status IN ('rascunho', 'erro', 'rejeitada');

    RETURN jsonb_build_object('ok', true, 'id', v_id);
  ELSE
    -- Insert new draft
    INSERT INTO public.fiscal_nfse_emissoes (
      empresa_id,
      tomador_pessoa_id,
      discriminacao,
      valor_servicos,
      valor_deducoes,
      iss_retido,
      aliquota_iss,
      item_lista_servico,
      codigo_municipio,
      municipio_prestacao,
      uf_prestacao,
      natureza_operacao
    ) VALUES (
      v_eid,
      (p_data->>'tomador_pessoa_id')::uuid,
      COALESCE(p_data->>'discriminacao', ''),
      COALESCE((p_data->>'valor_servicos')::numeric, 0),
      COALESCE((p_data->>'valor_deducoes')::numeric, 0),
      COALESCE((p_data->>'iss_retido')::boolean, false),
      COALESCE((p_data->>'aliquota_iss')::numeric, 0),
      p_data->>'item_lista_servico',
      p_data->>'codigo_municipio',
      p_data->>'municipio_prestacao',
      COALESCE(p_data->>'uf_prestacao', 'SP'),
      COALESCE(p_data->>'natureza_operacao', '1')
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fiscal_nfse_emissao_draft_upsert(jsonb) TO authenticated;

COMMIT;
