/*
  Fiscal (NF-e): RPC-first para configurações sensíveis (flags/config/emitente/numeração)

  Objetivo:
  - Evitar acesso direto do client a tabelas sensíveis (especialmente escrita).
  - Garantir enforcement no backend (admin/owner para alterações).
  - Reduzir risco de 403 por drift de RLS/grants e melhorar auditabilidade.

  Escopo:
  - public.empresa_feature_flags (manter SELECT para a view empresa_features; remover escrita do client)
  - public.fiscal_nfe_emissao_configs (RPC-only)
  - public.fiscal_nfe_emitente (RPC-only)
  - public.fiscal_nfe_numeracao (RPC-only)
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) Hardening: grants/policies
-- -----------------------------------------------------------------------------

-- 0.1) Feature flags: permitir leitura (view empresa_features), mas impedir escrita direta do client.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.empresa_feature_flags FROM authenticated;
GRANT SELECT ON TABLE public.empresa_feature_flags TO authenticated;

DROP POLICY IF EXISTS "Enable all access" ON public.empresa_feature_flags;
DROP POLICY IF EXISTS empresa_feature_flags_select ON public.empresa_feature_flags;
CREATE POLICY empresa_feature_flags_select
  ON public.empresa_feature_flags
  FOR SELECT
  TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS empresa_feature_flags_service_role ON public.empresa_feature_flags;
CREATE POLICY empresa_feature_flags_service_role
  ON public.empresa_feature_flags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 0.2) Tabelas de configuração (RPC-only): remover acesso direto do client.
REVOKE ALL ON TABLE public.fiscal_nfe_emissao_configs FROM authenticated;
REVOKE ALL ON TABLE public.fiscal_nfe_emitente FROM authenticated;
REVOKE ALL ON TABLE public.fiscal_nfe_numeracao FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_nfe_emissao_configs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_nfe_emitente TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_nfe_numeracao TO service_role;

DROP POLICY IF EXISTS "Enable all access" ON public.fiscal_nfe_emissao_configs;
DROP POLICY IF EXISTS fiscal_nfe_emissao_configs_service_role ON public.fiscal_nfe_emissao_configs;
CREATE POLICY fiscal_nfe_emissao_configs_service_role
  ON public.fiscal_nfe_emissao_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access" ON public.fiscal_nfe_emitente;
DROP POLICY IF EXISTS fiscal_nfe_emitente_service_role ON public.fiscal_nfe_emitente;
CREATE POLICY fiscal_nfe_emitente_service_role
  ON public.fiscal_nfe_emitente
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access" ON public.fiscal_nfe_numeracao;
DROP POLICY IF EXISTS fiscal_nfe_numeracao_service_role ON public.fiscal_nfe_numeracao;
CREATE POLICY fiscal_nfe_numeracao_service_role
  ON public.fiscal_nfe_numeracao
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 1) RPC: Feature flags
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fiscal_feature_flags_get();
CREATE OR REPLACE FUNCTION public.fiscal_feature_flags_get()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_enabled boolean := false;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  SELECT COALESCE(nfe_emissao_enabled, false)
  INTO v_enabled
  FROM public.empresa_feature_flags
  WHERE empresa_id = v_empresa
  LIMIT 1;

  RETURN jsonb_build_object('empresa_id', v_empresa, 'nfe_emissao_enabled', v_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_feature_flags_get() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_feature_flags_get() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fiscal_feature_flags_set(boolean);
CREATE OR REPLACE FUNCTION public.fiscal_feature_flags_set(
  p_nfe_emissao_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_enabled boolean := COALESCE(p_nfe_emissao_enabled, false);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('admin');

  INSERT INTO public.empresa_feature_flags (empresa_id, nfe_emissao_enabled)
  VALUES (v_empresa, v_enabled)
  ON CONFLICT (empresa_id) DO UPDATE
    SET nfe_emissao_enabled = EXCLUDED.nfe_emissao_enabled,
        updated_at = now();

  RETURN jsonb_build_object('empresa_id', v_empresa, 'nfe_emissao_enabled', v_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_feature_flags_set(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_feature_flags_set(boolean) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) RPC: Config do provedor (sem segredos)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fiscal_nfe_emissao_config_get(text);
CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissao_config_get(
  p_provider_slug text DEFAULT 'FOCUSNFE'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_provider text := COALESCE(NULLIF(btrim(p_provider_slug), ''), 'FOCUSNFE');
  v_row public.fiscal_nfe_emissao_configs%rowtype;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  SELECT * INTO v_row
  FROM public.fiscal_nfe_emissao_configs
  WHERE empresa_id = v_empresa
    AND provider_slug = v_provider
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_config_get(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_config_get(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fiscal_nfe_emissao_config_upsert(text, text, text, text);
CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissao_config_upsert(
  p_provider_slug text DEFAULT 'FOCUSNFE',
  p_ambiente text DEFAULT 'homologacao',
  p_webhook_secret_hint text DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_provider text := COALESCE(NULLIF(btrim(p_provider_slug), ''), 'FOCUSNFE');
  v_ambiente text := COALESCE(NULLIF(btrim(p_ambiente), ''), 'homologacao');
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('admin');

  IF v_ambiente NOT IN ('homologacao', 'producao') THEN
    RAISE EXCEPTION 'Ambiente inválido.' USING errcode='22023';
  END IF;

  INSERT INTO public.fiscal_nfe_emissao_configs (empresa_id, provider_slug, ambiente, webhook_secret_hint, observacoes)
  VALUES (
    v_empresa,
    v_provider,
    v_ambiente,
    NULLIF(btrim(COALESCE(p_webhook_secret_hint, '')), ''),
    NULLIF(btrim(COALESCE(p_observacoes, '')), '')
  )
  ON CONFLICT (empresa_id, provider_slug) DO UPDATE
    SET ambiente = EXCLUDED.ambiente,
        webhook_secret_hint = EXCLUDED.webhook_secret_hint,
        observacoes = EXCLUDED.observacoes,
        updated_at = now();

  RETURN jsonb_build_object(
    'empresa_id', v_empresa,
    'provider_slug', v_provider,
    'ambiente', v_ambiente
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_config_upsert(text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_config_upsert(text, text, text, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) RPC: Emitente
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fiscal_nfe_emitente_get();
CREATE OR REPLACE FUNCTION public.fiscal_nfe_emitente_get()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_row public.fiscal_nfe_emitente%rowtype;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  SELECT * INTO v_row
  FROM public.fiscal_nfe_emitente
  WHERE empresa_id = v_empresa
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emitente_get() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emitente_get() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fiscal_nfe_emitente_upsert(jsonb);
CREATE OR REPLACE FUNCTION public.fiscal_nfe_emitente_upsert(
  p_emitente jsonb
)
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
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('admin');

  -- Permite "patch parcial" (ex.: atualizar apenas certificado_storage_path).
  SELECT to_jsonb(e) INTO v_existing
  FROM public.fiscal_nfe_emitente e
  WHERE e.empresa_id = v_empresa
  LIMIT 1;
  v_payload := COALESCE(v_existing, '{}'::jsonb) || v_payload;

  v_cnpj := regexp_replace(COALESCE(v_payload->>'cnpj',''), '\\D', '', 'g');
  IF length(v_cnpj) <> 14 THEN
    RAISE EXCEPTION 'CNPJ inválido (precisa ter 14 dígitos).' USING errcode='22023';
  END IF;

  IF NULLIF(btrim(COALESCE(v_payload->>'razao_social','')), '') IS NULL THEN
    RAISE EXCEPTION 'Razão social é obrigatória.' USING errcode='22004';
  END IF;

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
    certificado_storage_path
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
    NULLIF(regexp_replace(COALESCE(v_payload->>'endereco_municipio_codigo',''), '\\D', '', 'g'), ''),
    NULLIF(btrim(COALESCE(v_payload->>'endereco_uf','')), ''),
    NULLIF(regexp_replace(COALESCE(v_payload->>'endereco_cep',''), '\\D', '', 'g'), ''),
    NULLIF(btrim(COALESCE(v_payload->>'telefone','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'email','')), ''),
    NULLIF(btrim(COALESCE(v_payload->>'certificado_storage_path','')), '')
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
    certificado_storage_path = EXCLUDED.certificado_storage_path;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emitente_upsert(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emitente_upsert(jsonb) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RPC: Numeração
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fiscal_nfe_numeracoes_list();
CREATE OR REPLACE FUNCTION public.fiscal_nfe_numeracoes_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_rows jsonb;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'empresa_id', n.empresa_id,
        'serie', n.serie,
        'proximo_numero', n.proximo_numero,
        'ativo', n.ativo
      )
      ORDER BY n.serie ASC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.fiscal_nfe_numeracao n
  WHERE n.empresa_id = v_empresa;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_numeracoes_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_numeracoes_list() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fiscal_nfe_numeracao_upsert(integer, integer, boolean);
CREATE OR REPLACE FUNCTION public.fiscal_nfe_numeracao_upsert(
  p_serie integer,
  p_proximo_numero integer,
  p_ativo boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_serie int := GREATEST(1, COALESCE(p_serie, 1));
  v_prox int := GREATEST(1, COALESCE(p_proximo_numero, 1));
  v_ativo boolean := COALESCE(p_ativo, true);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('admin');

  INSERT INTO public.fiscal_nfe_numeracao (empresa_id, serie, proximo_numero, ativo)
  VALUES (v_empresa, v_serie, v_prox, v_ativo)
  ON CONFLICT (empresa_id, serie) DO UPDATE SET
    proximo_numero = EXCLUDED.proximo_numero,
    ativo = EXCLUDED.ativo,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_numeracao_upsert(integer, integer, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_numeracao_upsert(integer, integer, boolean) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
