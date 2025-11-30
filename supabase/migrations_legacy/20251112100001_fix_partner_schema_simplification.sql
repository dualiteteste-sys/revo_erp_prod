-- MIGRATION TO SIMPLIFY PARTNER SCHEMA AND FIX DEPENDENCIES
-- This script removes legacy columns and tables related to partners,
-- correctly handling dependencies like the full-text search column.

/*
# [Simplify Partner Schema]
This operation permanently removes several columns from the `pessoas` table (`rg`, `celular`, `site`, `carteira_habilitacao`) and drops the `pessoa_enderecos` and `pessoa_contatos` tables entirely. It fixes a dependency issue with the `pessoa_search` column by recreating it after the other columns are dropped.

## Query Description: [This operation is destructive and will result in data loss for the removed fields. It is intended to simplify the partner registration form. Ensure you have a backup if you might need this data in the future. The `create_update_partner` and `get_partner_details` RPCs will also be updated to reflect these changes.]

## Metadata:
- Schema-Category: ["Dangerous", "Structural"]
- Impact-Level: ["High"]
- Requires-Backup: [true]
- Reversible: [false]

## Structure Details:
- Tables Dropped: `pessoa_enderecos`, `pessoa_contatos`
- Columns Dropped from `pessoas`: `rg`, `celular`, `site`, `carteira_habilitacao`, `pessoa_search` (temporarily)
- Columns Re-created in `pessoas`: `pessoa_search` (with new definition)
- RPCs Updated: `create_update_partner`, `get_partner_details`

## Security Implications:
- RLS Status: [Unchanged]
- Policy Changes: [No]
- Auth Requirements: [Authenticated user with access to the company]

## Performance Impact:
- Indexes: The `pessoas_search_idx` GIN index is dropped and recreated.
- Triggers: [Unchanged]
- Estimated Impact: [Minimal performance impact during migration. Search functionality is maintained.]
*/

BEGIN;

-- 1. Drop the search column and its index to remove dependencies.
-- The index is dropped automatically with the column.
ALTER TABLE public.pessoas DROP COLUMN IF EXISTS pessoa_search;

-- 2. Drop the requested columns from 'pessoas' table.
ALTER TABLE public.pessoas
  DROP COLUMN IF EXISTS rg,
  DROP COLUMN IF EXISTS celular,
  DROP COLUMN IF EXISTS site,
  DROP COLUMN IF EXISTS carteira_habilitacao;

-- 3. Drop related tables that are no longer needed.
DROP TABLE IF EXISTS public.pessoa_enderecos;
DROP TABLE IF EXISTS public.pessoa_contatos;

-- 4. Re-create the search column with the simplified fields.
ALTER TABLE public.pessoas
  ADD COLUMN pessoa_search tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(nome, '') || ' ' ||
      coalesce(fantasia, '') || ' ' ||
      coalesce(doc_unico, '') || ' ' ||
      coalesce(email, '')
    )
  ) STORED;

-- 5. Re-create the GIN index on the new search column.
CREATE INDEX IF NOT EXISTS pessoas_search_idx ON public.pessoas USING gin(pessoa_search);

-- 6. Update the 'create_update_partner' RPC to remove logic for addresses and contacts.
CREATE OR REPLACE FUNCTION public.create_update_partner(p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_pessoa_payload jsonb := p_payload->'pessoa';
    v_pessoa_id uuid;
    v_empresa_id uuid := public.current_empresa_id();
    v_result json;
BEGIN
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado ou sem empresa ativa.' USING ERRCODE = '28000';
    END IF;

    v_pessoa_id := (v_pessoa_payload->>'id')::uuid;

    IF v_pessoa_id IS NOT NULL THEN
        UPDATE public.pessoas p
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
            contribuinte_icms = (v_pessoa_payload->>'contribuinte_icms')::contribuinte_icms_enum
        WHERE p.id = v_pessoa_id AND p.empresa_id = v_empresa_id
        RETURNING p.id INTO v_pessoa_id;
    ELSE
        INSERT INTO public.pessoas (
            empresa_id, tipo, nome, doc_unico, email, telefone, inscr_estadual, isento_ie,
            inscr_municipal, observacoes, tipo_pessoa, fantasia, codigo_externo, contribuinte_icms
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
            (v_pessoa_payload->>'contribuinte_icms')::contribuinte_icms_enum
        )
        RETURNING id INTO v_pessoa_id;
    END IF;

    SELECT to_json(p) INTO v_result
    FROM public.pessoas p
    WHERE p.id = v_pessoa_id;

    SELECT jsonb_set(
        jsonb_set(v_result::jsonb, '{enderecos}', '[]'::jsonb),
        '{contatos}', '[]'::jsonb
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 7. Update 'get_partner_details' RPC to remove joins.
CREATE OR REPLACE FUNCTION public.get_partner_details(p_id uuid)
RETURNS json
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
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
    'enderecos', '[]'::json,
    'contatos', '[]'::json
  )
  FROM public.pessoas p
  WHERE p.id = p_id
  AND p.empresa_id = public.current_empresa_id();
$$;


COMMIT;
