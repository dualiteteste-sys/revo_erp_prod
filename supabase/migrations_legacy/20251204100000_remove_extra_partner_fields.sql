/*
# [Operação de Remoção de Campos de Parceiros]
Este script remove colunas não utilizadas da tabela `pessoas` e exclui completamente a tabela `pessoa_enderecos`, simplificando o cadastro de parceiros. As funções RPC relacionadas são atualizadas para refletir a nova estrutura.

## Query Description: [Esta operação removerá permanentemente os dados das colunas `rg`, `celular`, `site` da tabela `pessoas` e todos os dados da tabela `pessoa_enderecos`. Faça um backup do seu banco de dados antes de continuar se houver qualquer chance de precisar desses dados no futuro.]

## Metadata:
- Schema-Category: "Dangerous"
- Impact-Level: "High"
- Requires-Backup: true
- Reversible: true (com perda de dados)

## Structure Details:
- Tabela `pessoas`: Remove `rg`, `celular`, `site`.
- Tabela `pessoa_enderecos`: Tabela inteira removida.
- Funções: `create_update_partner`, `get_partner_details` são recriadas para remover a lógica de endereço.

## Security Implications:
- RLS Status: Inalterado.
- Policy Changes: Não.
- Auth Requirements: Acesso de `service_role` para executar a migração.

## Performance Impact:
- Indexes: Índices da tabela `pessoa_enderecos` serão removidos.
- Triggers: Triggers da tabela `pessoa_enderecos` serão removidos.
- Estimated Impact: Leve melhora na performance de escrita na tabela `pessoas` e remoção de joins nas consultas de detalhes.
*/

-- UP: REMOVE COLUMNS AND TABLE
BEGIN;

-- 1. Remove colunas da tabela pessoas
ALTER TABLE public.pessoas DROP COLUMN IF EXISTS rg;
ALTER TABLE public.pessoas DROP COLUMN IF EXISTS celular;
ALTER TABLE public.pessoas DROP COLUMN IF EXISTS site;

-- 2. Remove a tabela de endereços inteira
DROP TABLE IF EXISTS public.pessoa_enderecos CASCADE;

-- 3. Recria a função `get_partner_details` sem a lógica de endereços
CREATE OR REPLACE FUNCTION public.get_partner_details(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_pessoa record;
    v_contatos json;
BEGIN
    SELECT * INTO v_pessoa FROM public.pessoas p WHERE p.id = p_id AND p.empresa_id = public.current_empresa_id();

    IF v_pessoa IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT json_agg(c) INTO v_contatos FROM public.pessoa_contatos c WHERE c.pessoa_id = p_id;

    RETURN json_build_object(
        'pessoa', row_to_json(v_pessoa),
        'contatos', coalesce(v_contatos, '[]'::json)
    );
END;
$$;

-- 4. Recria a função `create_update_partner` sem a lógica de endereços
CREATE OR REPLACE FUNCTION public.create_update_partner(p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_pessoa_payload jsonb := p_payload->'pessoa';
    v_contatos_payload jsonb := p_payload->'contatos';
    v_pessoa_id uuid;
    v_empresa_id uuid := public.current_empresa_id();
    v_contato jsonb;
BEGIN
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não associado a uma empresa.';
    END IF;

    -- Upsert Pessoa
    INSERT INTO public.pessoas (
        id, empresa_id, tipo, nome, doc_unico, email, telefone, inscr_estadual,
        isento_ie, inscr_municipal, observacoes, tipo_pessoa, fantasia,
        codigo_externo, contribuinte_icms
    )
    VALUES (
        (v_pessoa_payload->>'id')::uuid,
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
        (v_pessoa_payload->>'contribuinte_icms')::contribuinte_icms_enum
    )
    ON CONFLICT (id) DO UPDATE SET
        tipo = EXCLUDED.tipo,
        nome = EXCLUDED.nome,
        doc_unico = EXCLUDED.doc_unico,
        email = EXCLUDED.email,
        telefone = EXCLUDED.telefone,
        inscr_estadual = EXCLUDED.inscr_estadual,
        isento_ie = EXCLUDED.isento_ie,
        inscr_municipal = EXCLUDED.inscr_municipal,
        observacoes = EXCLUDED.observacoes,
        tipo_pessoa = EXCLUDED.tipo_pessoa,
        fantasia = EXCLUDED.fantasia,
        codigo_externo = EXCLUDED.codigo_externo,
        contribuinte_icms = EXCLUDED.contribuinte_icms,
        updated_at = now()
    RETURNING id INTO v_pessoa_id;

    -- Sincronizar Contatos
    DELETE FROM public.pessoa_contatos WHERE pessoa_id = v_pessoa_id;
    IF jsonb_array_length(v_contatos_payload) > 0 THEN
        FOR v_contato IN SELECT * FROM jsonb_array_elements(v_contatos_payload)
        LOOP
            INSERT INTO public.pessoa_contatos (
                id, empresa_id, pessoa_id, nome, email, telefone, cargo, observacoes
            ) VALUES (
                coalesce((v_contato->>'id')::uuid, gen_random_uuid()),
                v_empresa_id,
                v_pessoa_id,
                v_contato->>'nome',
                v_contato->>'email',
                v_contato->>'telefone',
                v_contato->>'cargo',
                v_contato->>'observacoes'
            );
        END LOOP;
    END IF;

    RETURN public.get_partner_details(v_pessoa_id);
END;
$$;

COMMIT;

-- DOWN: RE-ADD COLUMNS AND TABLE (DATA WILL BE LOST)
/*
BEGIN;

-- Re-add columns to 'pessoas'
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS celular TEXT;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS site TEXT;

-- Recreate 'pessoa_enderecos' table
CREATE TABLE IF NOT EXISTS public.pessoa_enderecos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
    tipo_endereco TEXT,
    logradouro TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    cidade TEXT,
    uf CHAR(2),
    cep TEXT,
    pais TEXT DEFAULT 'BRASIL',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pessoa_enderecos_pessoa_id_idx ON public.pessoa_enderecos(pessoa_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pessoa_enderecos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.pessoa_enderecos ENABLE ROW LEVEL SECURITY;
-- Policies for pessoa_enderecos would need to be recreated here as well.

-- NOTE: The RPC functions `create_update_partner` and `get_partner_details` are not rolled back by this script.
-- You would need to re-apply a previous migration version of these functions to fully restore functionality.

COMMIT;
*/
