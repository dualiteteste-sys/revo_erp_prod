-- ============================================================
-- Fix: add NFC-e columns (csc, id_csc, nfce_serie, nfce_proximo_numero)
-- to fiscal_nfe_emitente_upsert RPC.
--
-- The foundation migration (20270322200000) added these columns to the
-- table but the upsert RPC (20270311150000) was not updated to handle them.
-- This migration replaces the function to include the 4 NFC-e columns.
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
    certificado_cnpj,
    -- NFC-e columns
    csc,
    id_csc,
    nfce_serie,
    nfce_proximo_numero
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
         ELSE NULLIF(btrim(COALESCE(v_payload->>'certificado_cnpj','')), '') END,
    -- NFC-e values
    NULLIF(btrim(COALESCE(v_payload->>'csc','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'id_csc','')), ''),
    COALESCE(NULLIF(btrim(COALESCE(v_payload->>'nfce_serie','')), '')::int, 1),
    COALESCE(NULLIF(btrim(COALESCE(v_payload->>'nfce_proximo_numero','')), '')::int, 1)
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
    certificado_cnpj = EXCLUDED.certificado_cnpj,
    -- NFC-e columns
    csc = EXCLUDED.csc,
    id_csc = EXCLUDED.id_csc,
    nfce_serie = EXCLUDED.nfce_serie,
    nfce_proximo_numero = EXCLUDED.nfce_proximo_numero;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emitente_upsert(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emitente_upsert(jsonb) TO authenticated, service_role;
