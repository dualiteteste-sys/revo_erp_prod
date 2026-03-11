-- Migration: NF-e Destinadas (Manifestação do Destinatário) — Foundation
-- Phase 1: core tables + certificado A1 encryption columns
BEGIN;

-- ============================================================
-- 1. fiscal_nfe_destinadas — NF-e received/addressed to us
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fiscal_nfe_destinadas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,

  -- SEFAZ identification
  chave_acesso         varchar(44) NOT NULL,
  nsu                  bigint NOT NULL,

  -- Summary (resNFe or procNFe)
  cnpj_emitente        varchar(14) NOT NULL,
  nome_emitente        text,
  ie_emitente          text,
  data_emissao         timestamptz NOT NULL,
  tipo_nfe             smallint,          -- 0=entrada, 1=saída
  valor_nf             numeric(15,2) NOT NULL,
  protocolo            text,
  situacao_nfe         smallint,          -- 1=autorizada

  -- Manifestation state machine
  status               text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','ciencia','confirmada','desconhecida','nao_realizada','ignorada')),
  manifestado_em       timestamptz,
  justificativa        text,             -- required for 'nao_realizada'

  -- Integration links
  fornecedor_id        uuid REFERENCES public.pessoas(id),
  conta_pagar_id       uuid,             -- relaxed FK (may not exist yet)
  recebimento_id       uuid,
  pedido_compra_id     uuid,

  -- XML storage paths (bucket nfe_docs or nfe_certificados)
  xml_resumo_path      text,
  xml_completo_path    text,
  xml_evento_path      text,

  -- Deadline tracking
  prazo_ciencia        timestamptz,      -- data_emissao + 10 days
  prazo_manifestacao   timestamptz,      -- data_emissao + 180 days

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_nfe_dest_empresa_chave UNIQUE (empresa_id, chave_acesso)
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_nfe_dest_empresa_status
  ON public.fiscal_nfe_destinadas(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_nfe_dest_empresa_nsu
  ON public.fiscal_nfe_destinadas(empresa_id, nsu);
CREATE INDEX IF NOT EXISTS idx_nfe_dest_cnpj_emit
  ON public.fiscal_nfe_destinadas(empresa_id, cnpj_emitente);
CREATE INDEX IF NOT EXISTS idx_nfe_dest_data_emissao
  ON public.fiscal_nfe_destinadas(empresa_id, data_emissao DESC);

-- RLS
ALTER TABLE public.fiscal_nfe_destinadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfe_dest_tenant_isolation ON public.fiscal_nfe_destinadas;
CREATE POLICY nfe_dest_tenant_isolation ON public.fiscal_nfe_destinadas
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.fiscal_nfe_destinadas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fiscal_nfe_destinadas TO service_role;

-- ============================================================
-- 2. fiscal_nfe_destinadas_sync — NSU tracking per empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fiscal_nfe_destinadas_sync (
  empresa_id           uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  ultimo_nsu           bigint NOT NULL DEFAULT 0,
  max_nsu              bigint NOT NULL DEFAULT 0,
  last_sync_at         timestamptz,
  last_sync_status     text,       -- 'ok', 'error', 'rate_limited'
  last_sync_error      text,
  sync_count_hour      int DEFAULT 0,
  sync_hour_started_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_nfe_destinadas_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfe_dest_sync_tenant_isolation ON public.fiscal_nfe_destinadas_sync;
CREATE POLICY nfe_dest_sync_tenant_isolation ON public.fiscal_nfe_destinadas_sync
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

GRANT SELECT, INSERT, UPDATE ON public.fiscal_nfe_destinadas_sync TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fiscal_nfe_destinadas_sync TO service_role;

-- ============================================================
-- 3. Add certificate password + metadata columns to fiscal_nfe_emitente
-- ============================================================
ALTER TABLE public.fiscal_nfe_emitente
  ADD COLUMN IF NOT EXISTS certificado_senha_encrypted text,
  ADD COLUMN IF NOT EXISTS certificado_validade timestamptz,
  ADD COLUMN IF NOT EXISTS certificado_cnpj varchar(14);

-- ============================================================
-- 4. RPC: list NF-e destinadas with filters + pagination
-- ============================================================
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
SET search_path = public
AS $$
DECLARE
  v_eid uuid := current_empresa_id();
  v_offset int;
  v_total bigint;
  v_rows jsonb;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  v_offset := GREATEST(0, (COALESCE(p_page, 1) - 1)) * COALESCE(p_page_size, 50);

  -- Count total matching
  SELECT count(*) INTO v_total
  FROM fiscal_nfe_destinadas d
  WHERE d.empresa_id = v_eid
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_start_date IS NULL OR d.data_emissao >= p_start_date::timestamptz)
    AND (p_end_date IS NULL OR d.data_emissao < (p_end_date::date + 1)::timestamptz)
    AND (p_cnpj_emitente IS NULL OR d.cnpj_emitente = p_cnpj_emitente)
    AND (p_search IS NULL OR p_search = '' OR
         d.nome_emitente ILIKE '%' || p_search || '%' OR
         d.chave_acesso ILIKE '%' || p_search || '%' OR
         d.cnpj_emitente ILIKE '%' || p_search || '%');

  -- Fetch page
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
    FROM fiscal_nfe_destinadas d
    LEFT JOIN pessoas p2 ON p2.id = d.fornecedor_id
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

GRANT EXECUTE ON FUNCTION public.fiscal_nfe_destinadas_list TO authenticated;

-- ============================================================
-- 5. RPC: summary counters for dashboard cards
-- ============================================================
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eid uuid := current_empresa_id();
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
  FROM fiscal_nfe_destinadas
  WHERE empresa_id = v_eid;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fiscal_nfe_destinadas_summary TO authenticated;

-- ============================================================
-- 6. RPC: get sync status
-- ============================================================
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_sync_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eid uuid := current_empresa_id();
  v_row record;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  SELECT * INTO v_row
  FROM fiscal_nfe_destinadas_sync
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

GRANT EXECUTE ON FUNCTION public.fiscal_nfe_destinadas_sync_status TO authenticated;

-- ============================================================
-- 7. RPC: upsert NF-e destinada (used by edge function)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_upsert(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eid uuid := current_empresa_id();
  v_id uuid;
  v_data_emissao timestamptz;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  v_data_emissao := (p_row->>'data_emissao')::timestamptz;

  INSERT INTO fiscal_nfe_destinadas (
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
    nsu              = GREATEST(fiscal_nfe_destinadas.nsu, EXCLUDED.nsu),
    nome_emitente    = COALESCE(EXCLUDED.nome_emitente, fiscal_nfe_destinadas.nome_emitente),
    ie_emitente      = COALESCE(EXCLUDED.ie_emitente, fiscal_nfe_destinadas.ie_emitente),
    valor_nf         = EXCLUDED.valor_nf,
    protocolo        = COALESCE(EXCLUDED.protocolo, fiscal_nfe_destinadas.protocolo),
    situacao_nfe     = COALESCE(EXCLUDED.situacao_nfe, fiscal_nfe_destinadas.situacao_nfe),
    xml_resumo_path  = COALESCE(EXCLUDED.xml_resumo_path, fiscal_nfe_destinadas.xml_resumo_path),
    updated_at       = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fiscal_nfe_destinadas_upsert TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_destinadas_upsert TO service_role;

-- ============================================================
-- 8. RPC: update manifestation status
-- ============================================================
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_manifestar(
  p_ids         uuid[],
  p_status      text,
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eid uuid := current_empresa_id();
  v_updated int;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  IF p_status NOT IN ('ciencia','confirmada','desconhecida','nao_realizada','ignorada') THEN
    RAISE EXCEPTION 'INVALID_STATUS: %', p_status;
  END IF;

  IF p_status = 'nao_realizada' AND (p_justificativa IS NULL OR length(trim(p_justificativa)) < 15) THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_REQUIRED (min 15 chars)';
  END IF;

  UPDATE fiscal_nfe_destinadas
  SET status = p_status,
      manifestado_em = now(),
      justificativa = CASE WHEN p_status = 'nao_realizada' THEN p_justificativa ELSE justificativa END,
      updated_at = now()
  WHERE empresa_id = v_eid
    AND id = ANY(p_ids);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fiscal_nfe_destinadas_manifestar TO authenticated;

-- ============================================================
-- 9. Update fiscal_nfe_emitente_upsert to handle cert metadata columns
--    When certificado_storage_path is set to NULL (cert deleted),
--    also clear the encrypted password + metadata.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fiscal_nfe_emitente_upsert(p_emitente jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_payload jsonb := COALESCE(p_emitente, '{}'::jsonb);
  v_existing jsonb;
  v_cnpj text;
  v_cert_path text;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('admin');

  -- Patch-partial: merge existing with new payload
  SELECT to_jsonb(e) INTO v_existing
  FROM public.fiscal_nfe_emitente e
  WHERE e.empresa_id = v_empresa
  LIMIT 1;
  v_payload := COALESCE(v_existing, '{}'::jsonb) || v_payload;

  v_cnpj := regexp_replace(COALESCE(v_payload->>'cnpj',''), '\D', '', 'g');
  IF length(v_cnpj) <> 14 THEN
    RAISE EXCEPTION 'CNPJ inválido (precisa ter 14 dígitos).' USING errcode='22023';
  END IF;

  IF NULLIF(btrim(COALESCE(v_payload->>'razao_social','')), '') IS NULL THEN
    RAISE EXCEPTION 'Razão social é obrigatória.' USING errcode='22004';
  END IF;

  v_cert_path := NULLIF(btrim(COALESCE(v_payload->>'certificado_storage_path','')), '');

  INSERT INTO public.fiscal_nfe_emitente (
    empresa_id,
    razao_social,
    nome_fantasia,
    cnpj,
    ie,
    im,
    cnae,
    crt,
    endereco_logradouro,
    endereco_numero,
    endereco_complemento,
    endereco_bairro,
    endereco_municipio,
    endereco_municipio_codigo,
    endereco_uf,
    endereco_cep,
    telefone,
    email,
    certificado_storage_path,
    certificado_senha_encrypted,
    certificado_validade,
    certificado_cnpj
  )
  VALUES (
    v_empresa,
    NULLIF(btrim(COALESCE(v_payload->>'razao_social','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'nome_fantasia','')), ''),
    v_cnpj,
    NULLIF(btrim(COALESCE(v_payload->>'ie','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'im','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'cnae','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'crt','')), '')::int,
    NULLIF(btrim(COALESCE(v_payload->>'endereco_logradouro','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'endereco_numero','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'endereco_complemento','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'endereco_bairro','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'endereco_municipio','')), ''),
    NULLIF(regexp_replace(COALESCE(v_payload->>'endereco_municipio_codigo',''), '\D', '', 'g'), ''),
    NULLIF(btrim(COALESCE(v_payload->>'endereco_uf','')), ''),
    NULLIF(regexp_replace(COALESCE(v_payload->>'endereco_cep',''), '\D', '', 'g'), ''),
    NULLIF(btrim(COALESCE(v_payload->>'telefone','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'email','')), ''),
    v_cert_path,
    -- If cert path is cleared, also clear encrypted password + metadata
    CASE WHEN v_cert_path IS NULL THEN NULL
         ELSE NULLIF(btrim(COALESCE(v_payload->>'certificado_senha_encrypted','')), '') END,
    CASE WHEN v_cert_path IS NULL THEN NULL
         ELSE (v_payload->>'certificado_validade')::timestamptz END,
    CASE WHEN v_cert_path IS NULL THEN NULL
         ELSE NULLIF(btrim(COALESCE(v_payload->>'certificado_cnpj','')), '') END
  )
  ON CONFLICT (empresa_id) DO UPDATE SET
    razao_social = EXCLUDED.razao_social,
    nome_fantasia = EXCLUDED.nome_fantasia,
    cnpj = EXCLUDED.cnpj,
    ie = EXCLUDED.ie,
    im = EXCLUDED.im,
    cnae = EXCLUDED.cnae,
    crt = EXCLUDED.crt,
    endereco_logradouro = EXCLUDED.endereco_logradouro,
    endereco_numero = EXCLUDED.endereco_numero,
    endereco_complemento = EXCLUDED.endereco_complemento,
    endereco_bairro = EXCLUDED.endereco_bairro,
    endereco_municipio = EXCLUDED.endereco_municipio,
    endereco_municipio_codigo = EXCLUDED.endereco_municipio_codigo,
    endereco_uf = EXCLUDED.endereco_uf,
    endereco_cep = EXCLUDED.endereco_cep,
    telefone = EXCLUDED.telefone,
    email = EXCLUDED.email,
    certificado_storage_path = EXCLUDED.certificado_storage_path,
    certificado_senha_encrypted = EXCLUDED.certificado_senha_encrypted,
    certificado_validade = EXCLUDED.certificado_validade,
    certificado_cnpj = EXCLUDED.certificado_cnpj;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emitente_upsert(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emitente_upsert(jsonb) TO authenticated, service_role;

COMMIT;
