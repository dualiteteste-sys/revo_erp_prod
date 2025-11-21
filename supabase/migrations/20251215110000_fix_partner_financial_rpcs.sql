/*
  # [PARCEIROS] Correção das Funções de CRUD para Campos Financeiros

  Este script corrige as funções `get_partner_details` e `create_update_partner` para incluir os novos campos financeiros (limite_credito, condicao_pagamento, informacoes_bancarias), garantindo que os dados sejam salvos e recuperados corretamente.

  ## Detalhes da Query:
  - **DROP FUNCTION IF EXISTS**: Remove as versões antigas das funções para permitir a alteração de seus tipos de retorno e parâmetros sem conflitos.
  - **CREATE OR REPLACE FUNCTION**: Recria as funções com a lógica atualizada.
    - `get_partner_details`: Agora retorna os novos campos financeiros.
    - `create_update_partner`: Agora insere e atualiza os novos campos financeiros na tabela `pessoas`.
  - **Segurança**: Mantém as permissões `SECURITY DEFINER` e `GRANT EXECUTE` para garantir que as operações sejam seguras e acessíveis apenas a usuários autenticados.

  ## Metadata:
  - Schema-Category: "Structural"
  - Impact-Level: "Medium"
  - Requires-Backup: false
  - Reversible: false (a menos que o backup da definição da função antiga seja mantido)

  ## Security Implications:
  - RLS Status: N/A (afeta RPCs, não RLS diretamente)
  - Policy Changes: No
  - Auth Requirements: `authenticated` role
*/

-- [RPC][PARCEIROS] get_partner_details
-- Drop a função existente primeiro para permitir a alteração do tipo de retorno.
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
    RAISE insufficient_privilege USING MESSAGE = 'Usuário não pertence à empresa ativa.';
  END IF;

  SELECT
    jsonb_build_object(
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
      'enderecos', COALESCE(
        (SELECT jsonb_agg(pe.*) FROM public.pessoa_enderecos pe WHERE pe.pessoa_id = p.id),
        '[]'::jsonb
      ),
      'contatos', COALESCE(
        (SELECT jsonb_agg(pc.*) FROM public.pessoa_contatos pc WHERE pc.pessoa_id = p.id),
        '[]'::jsonb
      )
    )
  INTO v_result
  FROM public.pessoas p
  WHERE p.id = p_id AND p.empresa_id = v_empresa_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_details(uuid) TO authenticated;

-- [RPC][PARCEIROS] create_update_partner
-- Drop a função existente primeiro para garantir a aplicação correta da nova assinatura.
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
    RAISE insufficient_privilege USING MESSAGE = 'Usuário não pertence à empresa ativa.';
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

  -- Retorna os detalhes completos
  SELECT public.get_partner_details(v_pessoa_id) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_update_partner(jsonb) TO authenticated;
