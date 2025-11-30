/*
# [MIGRATION] Corrige as funções de parceiros para incluir campos financeiros
Este script corrige um erro de migração anterior ao remover e recriar as funções
`create_update_partner` e `get_partner_details`. Isso é necessário porque o tipo de
retorno e os parâmetros foram alterados para suportar os novos campos financeiros,
uma alteração que o `CREATE OR REPLACE` não suporta diretamente.

## Query Description:
- `DROP FUNCTION IF EXISTS ...`: Garante que a execução seja segura e idempotente, removendo as versões antigas das funções antes de criá-las.
- `CREATE OR REPLACE FUNCTION ...`: Recria as funções com as assinaturas e lógicas corretas.
  - `create_update_partner`: Agora salva `limite_credito`, `condicao_pagamento`, e `informacoes_bancarias`.
  - `get_partner_details`: Agora retorna os novos campos financeiros ao buscar os detalhes de um parceiro.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Medium"
- Requires-Backup: false
- Reversible: false
*/

-- [RPC][PARCEIROS] CORREÇÃO: create_update_partner
DROP FUNCTION IF EXISTS public.create_update_partner(p_payload jsonb);
CREATE OR REPLACE FUNCTION public.create_update_partner(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_pessoa_id uuid;
  v_empresa_id uuid;
  v_pessoa_payload jsonb;
  v_enderecos_payload jsonb;
  v_contatos_payload jsonb;
  v_end jsonb;
  v_cont jsonb;
BEGIN
  -- Obter empresa_id da sessão
  SELECT public.current_empresa_id() INTO v_empresa_id;
  IF v_empresa_id IS NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Nenhuma empresa ativa encontrada.';
  END IF;

  v_pessoa_payload := p_payload->'pessoa';
  v_enderecos_payload := p_payload->'enderecos';
  v_contatos_payload := p_payload->'contatos';

  -- Inserir ou atualizar a pessoa
  IF v_pessoa_payload ? 'id' AND v_pessoa_payload->>'id' IS NOT NULL THEN
    v_pessoa_id := (v_pessoa_payload->>'id')::uuid;
    UPDATE public.pessoas
    SET
      tipo = (v_pessoa_payload->>'tipo')::pessoa_tipo,
      nome = v_pessoa_payload->>'nome',
      doc_unico = v_pessoa_payload->>'doc_unico',
      email = v_pessoa_payload->>'email',
      telefone = v_pessoa_payload->>'telefone',
      celular = v_pessoa_payload->>'celular',
      site = v_pessoa_payload->>'site',
      inscr_estadual = v_pessoa_payload->>'inscr_estadual',
      isento_ie = (v_pessoa_payload->>'isento_ie')::boolean,
      inscr_municipal = v_pessoa_payload->>'inscr_municipal',
      observacoes = v_pessoa_payload->>'observacoes',
      tipo_pessoa = (v_pessoa_payload->>'tipo_pessoa')::tipo_pessoa_enum,
      fantasia = v_pessoa_payload->>'fantasia',
      codigo_externo = v_pessoa_payload->>'codigo_externo',
      contribuinte_icms = (v_pessoa_payload->>'contribuinte_icms')::contribuinte_icms_enum,
      contato_tags = ARRAY(SELECT jsonb_array_elements_text(v_pessoa_payload->'contato_tags')),
      limite_credito = (v_pessoa_payload->>'limite_credito')::numeric,
      condicao_pagamento = v_pessoa_payload->>'condicao_pagamento',
      informacoes_bancarias = v_pessoa_payload->>'informacoes_bancarias'
    WHERE id = v_pessoa_id AND empresa_id = v_empresa_id;
  ELSE
    INSERT INTO public.pessoas (empresa_id, tipo, nome, doc_unico, email, telefone, celular, site, inscr_estadual, isento_ie, inscr_municipal, observacoes, tipo_pessoa, fantasia, codigo_externo, contribuinte_icms, contato_tags, limite_credito, condicao_pagamento, informacoes_bancarias)
    VALUES (
      v_empresa_id,
      (v_pessoa_payload->>'tipo')::pessoa_tipo,
      v_pessoa_payload->>'nome',
      v_pessoa_payload->>'doc_unico',
      v_pessoa_payload->>'email',
      v_pessoa_payload->>'telefone',
      v_pessoa_payload->>'celular',
      v_pessoa_payload->>'site',
      v_pessoa_payload->>'inscr_estadual',
      (v_pessoa_payload->>'isento_ie')::boolean,
      v_pessoa_payload->>'inscr_municipal',
      v_pessoa_payload->>'observacoes',
      (v_pessoa_payload->>'tipo_pessoa')::tipo_pessoa_enum,
      v_pessoa_payload->>'fantasia',
      v_pessoa_payload->>'codigo_externo',
      (v_pessoa_payload->>'contribuinte_icms')::contribuinte_icms_enum,
      ARRAY(SELECT jsonb_array_elements_text(v_pessoa_payload->'contato_tags')),
      (v_pessoa_payload->>'limite_credito')::numeric,
      v_pessoa_payload->>'condicao_pagamento',
      v_pessoa_payload->>'informacoes_bancarias'
    )
    RETURNING id INTO v_pessoa_id;
  END IF;

  -- Retornar os detalhes completos
  RETURN public.get_partner_details(v_pessoa_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_update_partner(jsonb) TO authenticated;

-- [RPC][PARCEIROS] CORREÇÃO: get_partner_details
DROP FUNCTION IF EXISTS public.get_partner_details(p_id uuid);
CREATE OR REPLACE FUNCTION public.get_partner_details(p_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT to_jsonb(p.*) || jsonb_build_object(
    'enderecos', (SELECT jsonb_agg(e) FROM pessoa_enderecos e WHERE e.pessoa_id = p.id),
    'contatos', (SELECT jsonb_agg(c) FROM pessoa_contatos c WHERE c.pessoa_id = p.id)
  )
  FROM pessoas p
  WHERE p.id = p_id AND p.empresa_id = public.current_empresa_id();
$$;
GRANT EXECUTE ON FUNCTION public.get_partner_details(uuid) TO authenticated;
