-- Super Cadastro: modify RPCs for centralized identity
-- 1. update_active_company: accept new fiscal fields + auto-sync to fiscal_nfe_emitente
-- 2. fiscal_nfe_emitente_upsert: also sync identity fields back to empresas (backward compat)

BEGIN;

-- ═══════════════════════════════════════════════════════
-- 1. update_active_company — add cnae, crt, endereco_municipio_codigo + sync to fiscal
-- ═══════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.update_active_company(jsonb);

CREATE FUNCTION public.update_active_company(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id    uuid := public.current_user_id();
  v_empresa_id uuid := public.current_empresa_id();
  v_row        public.empresas%rowtype;

  jkeys text[] := array[
    'nome_razao_social','razao_social',
    'nome_fantasia','fantasia',
    'cnpj','inscr_estadual','inscr_municipal',
    'cnae','crt','endereco_municipio_codigo',
    'email','telefone',
    'endereco_cep','endereco_logradouro','endereco_numero','endereco_complemento',
    'endereco_bairro','endereco_cidade','endereco_uf',
    'logotipo_url'
  ];

  v_json_key text;
  v_col_name text;
  v_val text;
  v_exists boolean;
  v_alt_exists boolean;
  v_out jsonb;
  v_nome_fantasia text;
  v_nome_razao_social text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode = '28000';
  END IF;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa definida para o usuário.' USING errcode = '22000';
  END IF;

  IF NOT public.is_user_member_of(v_empresa_id) THEN
    RAISE EXCEPTION 'Acesso negado à empresa ativa.' USING errcode = '42501';
  END IF;

  -- Atualiza campo a campo, aceitando sinônimos e schema legado.
  FOR v_json_key IN SELECT unnest(jkeys)
  LOOP
    v_col_name := CASE v_json_key
      WHEN 'razao_social' THEN 'nome_razao_social'
      WHEN 'fantasia'     THEN 'nome_fantasia'
      ELSE v_json_key
    END;

    v_val := p_patch ->> v_json_key;
    IF v_val IS NULL OR NULLIF(v_val,'') IS NULL THEN
      CONTINUE;
    END IF;

    IF v_col_name = 'cnpj' THEN
      v_val := regexp_replace(v_val, '\D', '', 'g');
      IF length(v_val) <> 14 THEN
        RAISE EXCEPTION 'CNPJ inválido (precisa ter 14 dígitos).' USING errcode='22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.empresas e
        WHERE e.cnpj = v_val AND e.id <> v_empresa_id
      ) THEN
        RAISE EXCEPTION 'CNPJ já cadastrado.' USING errcode='23505';
      END IF;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'empresas'
        AND column_name  = v_col_name
    ) INTO v_exists;

    -- Compat legado: se colunas novas não existem, tenta colunas antigas.
    IF NOT v_exists AND v_col_name = 'nome_fantasia' THEN
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'empresas'
          AND column_name  = 'fantasia'
      ) INTO v_alt_exists;
      IF v_alt_exists THEN
        v_col_name := 'fantasia';
        v_exists := true;
      END IF;
    END IF;

    IF NOT v_exists AND v_col_name = 'nome_razao_social' THEN
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'empresas'
          AND column_name  = 'razao_social'
      ) INTO v_alt_exists;
      IF v_alt_exists THEN
        v_col_name := 'razao_social';
        v_exists := true;
      END IF;
    END IF;

    IF NOT v_exists THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE public.empresas SET %I = $1, updated_at = timezone(''utc'', now()) WHERE id = $2',
      v_col_name
    )
    USING v_val, v_empresa_id;
  END LOOP;

  SELECT * INTO v_row
  FROM public.empresas e
  WHERE e.id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada ou sem autorização.' USING errcode = '23503';
  END IF;

  -- ── Super Cadastro sync: propagar identidade → fiscal_nfe_emitente ──
  -- Atualiza apenas se a row já existir (não auto-cria).
  UPDATE public.fiscal_nfe_emitente fe
  SET
    razao_social              = COALESCE(v_row.nome_razao_social, fe.razao_social),
    nome_fantasia             = v_row.nome_fantasia,
    cnpj                      = COALESCE(v_row.cnpj, fe.cnpj),
    ie                        = v_row.inscr_estadual,
    im                        = v_row.inscr_municipal,
    cnae                      = v_row.cnae,
    crt                       = v_row.crt,
    endereco_logradouro       = v_row.endereco_logradouro,
    endereco_numero           = v_row.endereco_numero,
    endereco_complemento      = v_row.endereco_complemento,
    endereco_bairro           = v_row.endereco_bairro,
    endereco_municipio        = v_row.endereco_cidade,
    endereco_municipio_codigo = v_row.endereco_municipio_codigo,
    endereco_uf               = v_row.endereco_uf,
    endereco_cep              = v_row.endereco_cep,
    telefone                  = v_row.telefone,
    email                     = v_row.email,
    updated_at                = now()
  WHERE fe.empresa_id = v_empresa_id;

  v_out := to_jsonb(v_row);

  -- Normaliza saída: sempre expor chaves `nome_*` mesmo em schema legado.
  v_nome_fantasia := COALESCE((v_out ->> 'nome_fantasia'), (v_out ->> 'fantasia'), NULL);
  v_nome_razao_social := COALESCE((v_out ->> 'nome_razao_social'), (v_out ->> 'razao_social'), NULL);

  IF v_out ? 'nome_fantasia' IS FALSE AND v_nome_fantasia IS NOT NULL THEN
    v_out := jsonb_set(v_out, '{nome_fantasia}', to_jsonb(v_nome_fantasia), TRUE);
  END IF;
  IF v_out ? 'nome_razao_social' IS FALSE AND v_nome_razao_social IS NOT NULL THEN
    v_out := jsonb_set(v_out, '{nome_razao_social}', to_jsonb(v_nome_razao_social), TRUE);
  END IF;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.update_active_company(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_active_company(jsonb) TO authenticated, service_role, postgres;


-- ═══════════════════════════════════════════════════════
-- 2. fiscal_nfe_emitente_upsert — also sync identity to empresas (backward compat)
-- ═══════════════════════════════════════════════════════

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
    razao_social, nome_fantasia, cnpj, ie, im, cnae, crt,
    endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro,
    endereco_municipio, endereco_municipio_codigo, endereco_uf, endereco_cep,
    telefone, email, certificado_storage_path, certificado_senha_encrypted,
    certificado_validade, certificado_cnpj,
    csc, id_csc, nfce_serie, nfce_proximo_numero
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
    CASE WHEN v_cert_path IS NULL THEN NULL
         ELSE NULLIF(btrim(COALESCE(v_payload->>'certificado_senha_encrypted','')), '') END,
    CASE WHEN v_cert_path IS NULL THEN NULL
         ELSE (v_payload->>'certificado_validade')::timestamptz END,
    CASE WHEN v_cert_path IS NULL THEN NULL
         ELSE NULLIF(btrim(COALESCE(v_payload->>'certificado_cnpj','')), '') END,
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
    csc = EXCLUDED.csc,
    id_csc = EXCLUDED.id_csc,
    nfce_serie = EXCLUDED.nfce_serie,
    nfce_proximo_numero = EXCLUDED.nfce_proximo_numero;

  -- ── Super Cadastro: sync identity back to empresas (backward compat) ──
  -- Se alguém ainda chama fiscal_nfe_emitente_upsert com dados de identidade,
  -- propagamos para empresas para manter source of truth consistente.
  UPDATE public.empresas e
  SET
    nome_razao_social       = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'razao_social','')), ''), e.nome_razao_social),
    nome_fantasia           = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'nome_fantasia','')), ''), e.nome_fantasia),
    cnpj                    = COALESCE(NULLIF(v_cnpj, ''), e.cnpj),
    inscr_estadual          = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'ie','')), ''), e.inscr_estadual),
    inscr_municipal         = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'im','')), ''), e.inscr_municipal),
    cnae                    = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'cnae','')), ''), e.cnae),
    crt                     = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'crt','')), '')::int, e.crt),
    endereco_logradouro     = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'endereco_logradouro','')), ''), e.endereco_logradouro),
    endereco_numero         = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'endereco_numero','')), ''), e.endereco_numero),
    endereco_complemento    = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'endereco_complemento','')), ''), e.endereco_complemento),
    endereco_bairro         = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'endereco_bairro','')), ''), e.endereco_bairro),
    endereco_cidade         = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'endereco_municipio','')), ''), e.endereco_cidade),
    endereco_municipio_codigo = COALESCE(NULLIF(regexp_replace(COALESCE(v_payload->>'endereco_municipio_codigo',''), '\D', '', 'g'), ''), e.endereco_municipio_codigo),
    endereco_uf             = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'endereco_uf','')), ''), e.endereco_uf),
    endereco_cep            = COALESCE(NULLIF(regexp_replace(COALESCE(v_payload->>'endereco_cep',''), '\D', '', 'g'), ''), e.endereco_cep),
    telefone                = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'telefone','')), ''), e.telefone),
    email                   = COALESCE(NULLIF(btrim(COALESCE(v_payload->>'email','')), ''), e.email),
    updated_at              = timezone('utc', now())
  WHERE e.id = v_empresa;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emitente_upsert(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emitente_upsert(jsonb) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
