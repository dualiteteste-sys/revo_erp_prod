-- [RPC][PARCEIROS] Fix get_partner_details and create_update_partner
-- Corrige a função get_partner_details que estava retornando uma estrutura de tabela
-- incompatível, causando o erro "structure of query does not match".
-- A função foi reescrita para retornar um único objeto JSONB, tornando-a mais robusta.
-- A função create_update_partner também foi recriada para garantir consistência.

-- Drop existing functions to avoid signature conflicts
DROP FUNCTION IF EXISTS public.get_partner_details(uuid);
DROP FUNCTION IF EXISTS public.create_update_partner(jsonb);

-- [RPC][PARCEIROS] get_partner_details (CORRECTED)
CREATE OR REPLACE FUNCTION public.get_partner_details(p_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    (SELECT to_jsonb(p) FROM public.pessoas p WHERE p.id = p_id)
    || jsonb_build_object('enderecos', COALESCE((SELECT jsonb_agg(pe) FROM public.pessoa_enderecos pe WHERE pe.pessoa_id = p_id), '[]'::jsonb))
    || jsonb_build_object('contatos', COALESCE((SELECT jsonb_agg(pc) FROM public.pessoa_contatos pc WHERE pc.pessoa_id = p_id), '[]'::jsonb))
  WHERE EXISTS (SELECT 1 FROM public.pessoas p WHERE p.id = p_id AND public.is_user_member_of(p.empresa_id));
$$;

-- [RPC][PARCEIROS] create_update_partner (UPDATED)
CREATE OR REPLACE FUNCTION public.create_update_partner(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_pessoa_id uuid;
  v_pessoa_payload jsonb;
  v_enderecos_payload jsonb;
  v_contatos_payload jsonb;
  v_empresa_id uuid;
  v_end jsonb;
  v_cont jsonb;
BEGIN
  -- Get active company and validate user membership
  SELECT eu.empresa_id INTO v_empresa_id
  FROM public.empresa_usuarios eu
  WHERE eu.user_id = public.current_user_id() AND eu.is_principal = true
  LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE insufficient_privilege USING message = 'Nenhuma empresa ativa encontrada para o usuário.';
  END IF;

  v_pessoa_payload := p_payload->'pessoa';
  v_enderecos_payload := p_payload->'enderecos';
  v_contatos_payload := p_payload->'contatos';

  -- Upsert pessoa
  IF v_pessoa_payload ? 'id' AND v_pessoa_payload->>'id' IS NOT NULL THEN
    v_pessoa_id := (v_pessoa_payload->>'id')::uuid;
    UPDATE public.pessoas
    SET
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
      contato_tags = (SELECT jsonb_agg(value) FROM jsonb_array_elements_text(v_pessoa_payload->'contato_tags')),
      celular = v_pessoa_payload->>'celular',
      site = v_pessoa_payload->>'site',
      limite_credito = (v_pessoa_payload->>'limite_credito')::numeric,
      condicao_pagamento = v_pessoa_payload->>'condicao_pagamento',
      informacoes_bancarias = v_pessoa_payload->>'informacoes_bancarias'
    WHERE id = v_pessoa_id AND empresa_id = v_empresa_id;
  ELSE
    INSERT INTO public.pessoas (empresa_id, tipo, nome, doc_unico, email, telefone, inscr_estadual, isento_ie, inscr_municipal, observacoes, tipo_pessoa, fantasia, codigo_externo, contribuinte_icms, contato_tags, celular, site, limite_credito, condicao_pagamento, informacoes_bancarias)
    VALUES (
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
      (SELECT jsonb_agg(value) FROM jsonb_array_elements_text(v_pessoa_payload->'contato_tags')),
      v_pessoa_payload->>'celular',
      v_pessoa_payload->>'site',
      (v_pessoa_payload->>'limite_credito')::numeric,
      v_pessoa_payload->>'condicao_pagamento',
      v_pessoa_payload->>'informacoes_bancarias'
    ) RETURNING id INTO v_pessoa_id;
  END IF;

  -- Upsert enderecos
  DELETE FROM public.pessoa_enderecos WHERE pessoa_id = v_pessoa_id;
  IF jsonb_array_length(v_enderecos_payload) > 0 THEN
    FOR v_end IN SELECT * FROM jsonb_array_elements(v_enderecos_payload)
    LOOP
      INSERT INTO public.pessoa_enderecos (pessoa_id, empresa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais)
      VALUES (v_pessoa_id, v_empresa_id, v_end->>'tipo_endereco', v_end->>'logradouro', v_end->>'numero', v_end->>'complemento', v_end->>'bairro', v_end->>'cidade', v_end->>'uf', vend->>'cep', v_end->>'pais');
    END LOOP;
  END IF;

  -- Upsert contatos
  DELETE FROM public.pessoa_contatos WHERE pessoa_id = v_pessoa_id;
  IF jsonb_array_length(v_contatos_payload) > 0 THEN
    FOR v_cont IN SELECT * FROM jsonb_array_elements(v_contatos_payload)
    LOOP
      INSERT INTO public.pessoa_contatos (pessoa_id, empresa_id, nome, email, telefone, cargo, observacoes)
      VALUES (v_pessoa_id, v_empresa_id, v_cont->>'nome', v_cont->>'email', v_cont->>'telefone', v_cont->>'cargo', v_cont->>'observacoes');
    END LOOP;
  END IF;

  RETURN public.get_partner_details(v_pessoa_id);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_partner_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_update_partner(jsonb) TO authenticated;
