/*
  # [Structural] Remove campo `contato_tags` da tabela `pessoas`

  ## Query Description: 
  Esta operação remove a coluna `contato_tags` da tabela `pessoas` e atualiza as funções RPC relacionadas (`create_update_partner` e `get_partner_details`) para não mais processar ou retornar este campo. A remoção do campo é uma mudança estrutural que resultará na perda permanente dos dados de tags de contato existentes.

  ## Metadata:
  - Schema-Category: "Structural"
  - Impact-Level: "Medium"
  - Requires-Backup: true
  - Reversible: false (a reversão recria a coluna, mas não os dados)

  ## Structure Details:
  - Tabela afetada: `public.pessoas`
  - Coluna removida: `contato_tags`
  - Funções afetadas: `public.create_update_partner`, `public.get_partner_details`

  ## Security Implications:
  - RLS Status: Inalterado
  - Policy Changes: Não
  - Auth Requirements: Acesso de `supabase_admin` para executar a migração.

  ## Performance Impact:
  - Indexes: Nenhum
  - Triggers: Nenhum
  - Estimated Impact: Baixo. A remoção da coluna pode exigir um breve bloqueio na tabela.
*/

-- UP
BEGIN;

ALTER TABLE public.pessoas DROP COLUMN IF EXISTS contato_tags;

-- Recriar a função create_update_partner sem a lógica de contato_tags
CREATE OR REPLACE FUNCTION public.create_update_partner(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_pessoa_id uuid;
    v_pessoa_payload jsonb := p_payload->'pessoa';
    v_enderecos_payload jsonb := p_payload->'enderecos';
    v_contatos_payload jsonb := p_payload->'contatos';
    v_endereco jsonb;
    v_contato jsonb;
    v_result jsonb;
BEGIN
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma empresa ativa definida para o usuário.' USING ERRCODE = '28000';
    END IF;

    -- Upsert Pessoa
    v_pessoa_id := (v_pessoa_payload->>'id')::uuid;
    IF v_pessoa_id IS NULL THEN
        -- Create
        INSERT INTO public.pessoas (
            empresa_id, tipo, nome, doc_unico, email, telefone, inscr_estadual, isento_ie,
            inscr_municipal, observacoes, tipo_pessoa, fantasia, codigo_externo,
            contribuinte_icms, rg, celular, site, carteira_habilitacao
        )
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
            v_pessoa_payload->>'rg',
            v_pessoa_payload->>'celular',
            v_pessoa_payload->>'site',
            v_pessoa_payload->>'carteira_habilitacao'
        ) RETURNING id INTO v_pessoa_id;
    ELSE
        -- Update
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
            rg = v_pessoa_payload->>'rg',
            celular = v_pessoa_payload->>'celular',
            site = v_pessoa_payload->>'site',
            carteira_habilitacao = v_pessoa_payload->>'carteira_habilitacao'
        WHERE id = v_pessoa_id AND empresa_id = v_empresa_id;
    END IF;

    -- Upsert Endereços
    IF jsonb_array_length(v_enderecos_payload) > 0 THEN
        -- Delete existing addresses not in the payload
        DELETE FROM public.pessoa_enderecos
        WHERE pessoa_id = v_pessoa_id
          AND id NOT IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(v_enderecos_payload) WHERE value->>'id' IS NOT NULL);

        FOR v_endereco IN SELECT * FROM jsonb_array_elements(v_enderecos_payload)
        LOOP
            INSERT INTO public.pessoa_enderecos (id, empresa_id, pessoa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais)
            VALUES (
                COALESCE((v_endereco->>'id')::uuid, gen_random_uuid()),
                v_empresa_id, v_pessoa_id,
                v_endereco->>'tipo_endereco', v_endereco->>'logradouro', v_endereco->>'numero',
                v_endereco->>'complemento', v_endereco->>'bairro', v_endereco->>'cidade',
                v_endereco->>'uf', v_endereco->>'cep', COALESCE(v_endereco->>'pais', 'BRASIL')
            )
            ON CONFLICT (id) DO UPDATE SET
                tipo_endereco = EXCLUDED.tipo_endereco, logradouro = EXCLUDED.logradouro,
                numero = EXCLUDED.numero, complemento = EXCLUDED.complemento,
                bairro = EXCLUDED.bairro, cidade = EXCLUDED.cidade, uf = EXCLUDED.uf,
                cep = EXCLUDED.cep, pais = EXCLUDED.pais;
        END LOOP;
    END IF;

    -- Upsert Contatos
    IF jsonb_array_length(v_contatos_payload) > 0 THEN
        -- Delete existing contacts not in the payload
        DELETE FROM public.pessoa_contatos
        WHERE pessoa_id = v_pessoa_id
          AND id NOT IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(v_contatos_payload) WHERE value->>'id' IS NOT NULL);

        FOR v_contato IN SELECT * FROM jsonb_array_elements(v_contatos_payload)
        LOOP
            INSERT INTO public.pessoa_contatos (id, empresa_id, pessoa_id, nome, email, telefone, cargo, observacoes)
            VALUES (
                COALESCE((v_contato->>'id')::uuid, gen_random_uuid()),
                v_empresa_id, v_pessoa_id,
                v_contato->>'nome', v_contato->>'email', v_contato->>'telefone',
                v_contato->>'cargo', v_contato->>'observacoes'
            )
            ON CONFLICT (id) DO UPDATE SET
                nome = EXCLUDED.nome, email = EXCLUDED.email, telefone = EXCLUDED.telefone,
                cargo = EXCLUDED.cargo, observacoes = EXCLUDED.observacoes;
        END LOOP;
    END IF;

    -- Return the full partner details
    SELECT get_partner_details(v_pessoa_id) INTO v_result;
    RETURN v_result;
END;
$$;

-- Recriar a função get_partner_details sem a lógica de contato_tags
CREATE OR REPLACE FUNCTION public.get_partner_details(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
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
      'rg', p.rg,
      'celular', p.celular,
      'site', p.site,
      'carteira_habilitacao', p.carteira_habilitacao,
      'enderecos', (
        SELECT COALESCE(jsonb_agg(pe.*), '[]'::jsonb)
        FROM public.pessoa_enderecos pe
        WHERE pe.pessoa_id = p.id
      ),
      'contatos', (
        SELECT COALESCE(jsonb_agg(pc.*), '[]'::jsonb)
        FROM public.pessoa_contatos pc
        WHERE pc.pessoa_id = p.id
      )
    )
  FROM public.pessoas p
  WHERE p.id = p_id
    AND p.empresa_id = public.current_empresa_id();
$$;

COMMIT;

-- DOWN
-- Para reverter, a coluna pode ser adicionada novamente.
-- Os dados originais serão perdidos.
-- As funções RPC precisariam ser revertidas para uma versão anterior a partir de um arquivo de migração anterior.
-- BEGIN;
-- ALTER TABLE public.pessoas ADD COLUMN contato_tags TEXT[] NULL;
-- COMMIT;
