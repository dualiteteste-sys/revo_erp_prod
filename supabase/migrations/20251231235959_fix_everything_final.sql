-- =============================================================================
-- NUCLEAR FIX: Resolve 503 Recursion & 400 RAISE Syntax Errors
-- Date: 2025-12-31 (Future dated to ensure it overrides everything)
-- =============================================================================

-- 1. FIX RECURSION: is_user_member_of
-- Redefine to be non-recursive by querying table directly with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_user_member_of(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = public.current_user_id()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_user_member_of(uuid) TO authenticated, service_role;

-- 2. FIX BOOTSTRAP: bootstrap_empresa_for_current_user
-- Robust version with logging and no RAISE EXCEPTION for flow control
DROP FUNCTION IF EXISTS public.bootstrap_empresa_for_current_user(text, text);

CREATE OR REPLACE FUNCTION public.bootstrap_empresa_for_current_user(
    p_razao_social text DEFAULT NULL,
    p_fantasia     text DEFAULT NULL
)
RETURNS TABLE(empresa_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id    uuid := public.current_user_id();
    v_empresa_id uuid;
BEGIN
    -- Log start
    PERFORM pg_notify('app_log', '[BOOTSTRAP] Starting for user: ' || COALESCE(v_user_id::text, 'NULL'));

    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, 'error_unauthenticated'::text;
        RETURN;
    END IF;

    -- 1) Check active company
    SELECT uae.empresa_id INTO v_empresa_id
      FROM public.user_active_empresa uae
     WHERE uae.user_id = v_user_id
     ORDER BY uae.updated_at DESC NULLS LAST
     LIMIT 1;

    IF v_empresa_id IS NOT NULL THEN
        RETURN QUERY SELECT v_empresa_id, 'already_active'::text;
        RETURN;
    END IF;

    -- 2) Check membership
    SELECT eu.empresa_id INTO v_empresa_id
      FROM public.empresa_usuarios eu
     WHERE eu.user_id = v_user_id
     LIMIT 1;

    IF v_empresa_id IS NOT NULL THEN
        INSERT INTO public.user_active_empresa (user_id, empresa_id)
        VALUES (v_user_id, v_empresa_id)
        ON CONFLICT (user_id) DO UPDATE SET empresa_id = EXCLUDED.empresa_id, updated_at = now();
        RETURN QUERY SELECT v_empresa_id, 'activated_existing'::text;
        RETURN;
    END IF;

    -- 3) Create new company
    INSERT INTO public.empresas (razao_social, fantasia)
    VALUES (
        COALESCE(p_razao_social, 'Minha Empresa'),
        COALESCE(p_fantasia, p_razao_social, 'Minha Empresa')
    )
    RETURNING id INTO v_empresa_id;

    -- Link user
    BEGIN
        INSERT INTO public.empresa_usuarios (empresa_id, user_id, status)
        VALUES (v_empresa_id, v_user_id, 'ACTIVE');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.empresa_usuarios (empresa_id, user_id)
        VALUES (v_empresa_id, v_user_id);
    END;

    -- Set active
    INSERT INTO public.user_active_empresa (user_id, empresa_id)
    VALUES (v_user_id, v_empresa_id)
    ON CONFLICT (user_id) DO UPDATE SET empresa_id = EXCLUDED.empresa_id, updated_at = now();

    RETURN QUERY SELECT v_empresa_id, 'created_new'::text;
EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('app_log', '[BOOTSTRAP] Error: ' || SQLERRM);
    RETURN QUERY SELECT NULL::uuid, 'error_internal: ' || SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bootstrap_empresa_for_current_user(text, text) TO authenticated, service_role;

-- 3. FIX SYNTAX: Carriers (create_update_carrier, get_carrier_details, delete_carrier)
CREATE OR REPLACE FUNCTION public.create_update_carrier(p_payload jsonb)
RETURNS public.transportadoras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_carrier_id uuid := (p_payload->>'id')::uuid;
  v_carrier public.transportadoras;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[AUTH] Empresa não definida na sessão.';
  END IF;

  IF v_carrier_id IS NOT NULL THEN
    UPDATE public.transportadoras
    SET
      nome_razao_social = p_payload->>'nome_razao_social',
      nome_fantasia = p_payload->>'nome_fantasia',
      cnpj = p_payload->>'cnpj',
      inscr_estadual = p_payload->>'inscr_estadual',
      status = (p_payload->>'status')::public.status_transportadora
    WHERE id = v_carrier_id AND empresa_id = v_empresa_id
    RETURNING * INTO v_carrier;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transportadora não encontrada ou pertence a outra empresa.';
    END IF;
  ELSE
    INSERT INTO public.transportadoras (
      empresa_id, nome_razao_social, nome_fantasia, cnpj, inscr_estadual, status
    )
    VALUES (
      v_empresa_id,
      p_payload->>'nome_razao_social',
      p_payload->>'nome_fantasia',
      p_payload->>'cnpj',
      p_payload->>'inscr_estadual',
      (p_payload->>'status')::public.status_transportadora
    )
    RETURNING * INTO v_carrier;
  END IF;
  RETURN v_carrier;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_carrier_details(p_id uuid)
RETURNS public.transportadoras
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_carrier public.transportadoras;
BEGIN
    SELECT * INTO v_carrier
    FROM public.transportadoras t
    WHERE t.id = p_id AND t.empresa_id = public.current_empresa_id();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transportadora não encontrada.';
    END IF;
    RETURN v_carrier;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_carrier(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[AUTH] Empresa não definida na sessão.';
  END IF;

  DELETE FROM public.transportadoras
  WHERE id = p_id AND empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transportadora não encontrada ou pertence a outra empresa.';
  END IF;
END;
$$;

-- 4. FIX SYNTAX: Partners (get_partner_details, create_update_partner)
DROP FUNCTION IF EXISTS public.get_partner_details(uuid);
CREATE OR REPLACE FUNCTION public.get_partner_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_result jsonb;
BEGIN
  IF NOT public.is_user_member_of(v_empresa_id) THEN
    RAISE EXCEPTION 'Usuário não pertence à empresa ativa.';
  END IF;

  SELECT jsonb_build_object(
      'id', p.id,
      'empresa_id', p.empresa_id,
      'tipo', p.tipo,
      'nome', p.nome,
      'doc_unico', p.doc_unico,
      'email', p.email,
      'telefone', p.telefone,
      'inscr_estadual', p.inscr_estadual,
      'isento_ie', p.isento_ie,
      'inscr_municipal', p.inscr_municipal,
      'observacoes', p.observacoes,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'tipo_pessoa', p.tipo_pessoa,
      'fantasia', p.fantasia,
      'codigo_externo', p.codigo_externo,
      'contribuinte_icms', p.contribuinte_icms,
      'contato_tags', p.contato_tags,
      'celular', p.celular,
      'site', p.site,
      'limite_credito', p.limite_credito,
      'condicao_pagamento', p.condicao_pagamento,
      'informacoes_bancarias', p.informacoes_bancarias,
      'enderecos', COALESCE((SELECT jsonb_agg(pe.*) FROM public.pessoa_enderecos pe WHERE pe.pessoa_id = p.id), '[]'::jsonb),
      'contatos', COALESCE((SELECT jsonb_agg(pc.*) FROM public.pessoa_contatos pc WHERE pc.pessoa_id = p.id), '[]'::jsonb)
    )
  INTO v_result
  FROM public.pessoas p
  WHERE p.id = p_id AND p.empresa_id = v_empresa_id;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.create_update_partner(jsonb);
CREATE OR REPLACE FUNCTION public.create_update_partner(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_pessoa_payload jsonb;
  v_enderecos_payload jsonb;
  v_contatos_payload jsonb;
  v_pessoa_id uuid;
  v_result jsonb;
  v_endereco jsonb;
  v_contato jsonb;
BEGIN
  IF NOT public.is_user_member_of(v_empresa_id) THEN
    RAISE EXCEPTION 'Usuário não pertence à empresa ativa.';
  END IF;

  v_pessoa_payload := p_payload->'pessoa';
  v_enderecos_payload := p_payload->'enderecos';
  v_contatos_payload := p_payload->'contatos';

  -- Upsert pessoa
  IF v_pessoa_payload ? 'id' AND v_pessoa_payload->>'id' IS NOT NULL THEN
    v_pessoa_id := (v_pessoa_payload->>'id')::uuid;
    UPDATE public.pessoas SET
      tipo = (v_pessoa_payload->>'tipo')::pessoa_tipo,
      nome = v_pessoa_payload->>'nome',
      doc_unico = v_pessoa_payload->>'doc_unico',
      email = v_pessoa_payload->>'email',
      telefone = v_pessoa_payload->>'telefone',
      inscr_estadual = v_pessoa_payload->>'inscr_estadual',
      isento_ie = (v_pessoa_payload->>'isento_ie')::boolean,
      inscr_municipal = v_pessoa_payload->>'inscr_municipal',
      observacoes = v_pessoa_payload->>'observacoes',
      tipo_pessoa = (v_pessoa_payload->>'tipo_pessoa')::tipo_pessoa_enum,
      fantasia = v_pessoa_payload->>'fantasia',
      codigo_externo = v_pessoa_payload->>'codigo_externo',
      contribuinte_icms = (v_pessoa_payload->>'contribuinte_icms')::contribuinte_icms_enum,
      contato_tags = (SELECT array_agg(t) FROM jsonb_array_elements_text(v_pessoa_payload->'contato_tags') as t),
      celular = v_pessoa_payload->>'celular',
      site = v_pessoa_payload->>'site',
      limite_credito = (v_pessoa_payload->>'limite_credito')::numeric,
      condicao_pagamento = v_pessoa_payload->>'condicao_pagamento',
      informacoes_bancarias = v_pessoa_payload->>'informacoes_bancarias'
    WHERE id = v_pessoa_id AND empresa_id = v_empresa_id;
  ELSE
    INSERT INTO public.pessoas (
      empresa_id, tipo, nome, doc_unico, email, telefone, inscr_estadual, isento_ie, inscr_municipal, observacoes, tipo_pessoa, fantasia, codigo_externo, contribuinte_icms, contato_tags, celular, site, limite_credito, condicao_pagamento, informacoes_bancarias
    ) VALUES (
      v_empresa_id,
      (v_pessoa_payload->>'tipo')::pessoa_tipo,
      v_pessoa_payload->>'nome',
      v_pessoa_payload->>'doc_unico',
      v_pessoa_payload->>'email',
      v_pessoa_payload->>'telefone',
      v_pessoa_payload->>'inscr_estadual',
      (v_pessoa_payload->>'isento_ie')::boolean,
      v_pessoa_payload->>'inscr_municipal',
      v_pessoa_payload->>'observacoes',
      (v_pessoa_payload->>'tipo_pessoa')::tipo_pessoa_enum,
      v_pessoa_payload->>'fantasia',
      v_pessoa_payload->>'codigo_externo',
      (v_pessoa_payload->>'contribuinte_icms')::contribuinte_icms_enum,
      (SELECT array_agg(t) FROM jsonb_array_elements_text(v_pessoa_payload->'contato_tags') as t),
      v_pessoa_payload->>'celular',
      v_pessoa_payload->>'site',
      (v_pessoa_payload->>'limite_credito')::numeric,
      v_pessoa_payload->>'condicao_pagamento',
      v_pessoa_payload->>'informacoes_bancarias'
    ) RETURNING id INTO v_pessoa_id;
  END IF;

  -- Upsert enderecos
  IF v_enderecos_payload IS NOT NULL THEN
    FOR v_endereco IN SELECT * FROM jsonb_array_elements(v_enderecos_payload) LOOP
      IF v_endereco ? 'id' AND v_endereco->>'id' IS NOT NULL THEN
        UPDATE public.pessoa_enderecos SET
          tipo_endereco = v_endereco->>'tipo_endereco',
          logradouro = v_endereco->>'logradouro',
          numero = v_endereco->>'numero',
          complemento = v_endereco->>'complemento',
          bairro = v_endereco->>'bairro',
          cidade = v_endereco->>'cidade',
          uf = v_endereco->>'uf',
          cep = v_endereco->>'cep',
          pais = v_endereco->>'pais'
        WHERE id = (v_endereco->>'id')::uuid AND empresa_id = v_empresa_id;
      ELSE
        INSERT INTO public.pessoa_enderecos (empresa_id, pessoa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais)
        VALUES (v_empresa_id, v_pessoa_id, v_endereco->>'tipo_endereco', v_endereco->>'logradouro', v_endereco->>'numero', v_endereco->>'complemento', v_endereco->>'bairro', v_endereco->>'cidade', v_endereco->>'uf', v_endereco->>'cep', v_endereco->>'pais');
      END IF;
    END LOOP;
  END IF;

  -- Upsert contatos
  IF v_contatos_payload IS NOT NULL THEN
    FOR v_contato IN SELECT * FROM jsonb_array_elements(v_contatos_payload) LOOP
      IF v_contato ? 'id' AND v_contato->>'id' IS NOT NULL THEN
        UPDATE public.pessoa_contatos SET
          nome = v_contato->>'nome',
          email = v_contato->>'email',
          telefone = v_contato->>'telefone',
          cargo = v_contato->>'cargo',
          observacoes = v_contato->>'observacoes'
        WHERE id = (v_contato->>'id')::uuid AND empresa_id = v_empresa_id;
      ELSE
        INSERT INTO public.pessoa_contatos (empresa_id, pessoa_id, nome, email, telefone, cargo, observacoes)
        VALUES (v_empresa_id, v_pessoa_id, v_contato->>'nome', v_contato->>'email', v_contato->>'telefone', v_contato->>'cargo', v_contato->>'observacoes');
      END IF;
    END LOOP;
  END IF;

  SELECT public.get_partner_details(v_pessoa_id) INTO v_result;
  RETURN v_result;
END;
$$;

-- Cache reload
SELECT pg_notify('pgrst','reload schema');
