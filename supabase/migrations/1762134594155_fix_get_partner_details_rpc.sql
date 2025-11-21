-- [RPC][PARCEIROS] Corrige a função get_partner_details para retornar um JSON completo
/*
          # [Operation Name]
          Fix Partner Details RPC

          ## Query Description: [This operation replaces the `get_partner_details` function to fix a column type mismatch error. The new function returns a single, complete JSON object containing all partner details, including related addresses and contacts. This change is safe and does not affect existing data, but it is critical for the partner editing feature to work correctly.]

          ## Metadata:
          - Schema-Category: "Structural"
          - Impact-Level: "Low"
          - Requires-Backup: false
          - Reversible: true

          ## Structure Details:
          - Function `get_partner_details(uuid)`: Replaced entirely.

          ## Security Implications:
          - RLS Status: Unchanged
          - Policy Changes: No
          - Auth Requirements: The function remains `SECURITY INVOKER`, respecting existing RLS policies.

          ## Performance Impact:
          - Indexes: None
          - Triggers: None
          - Estimated Impact: Negligible. The query is efficient for fetching a single partner's details.
          */
DROP FUNCTION IF EXISTS public.get_partner_details(uuid);

CREATE OR REPLACE FUNCTION public.get_partner_details(p_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    json_build_object(
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
        (SELECT json_agg(e) FROM public.pessoa_enderecos e WHERE e.pessoa_id = p.id),
        '[]'::json
      ),
      
      'contatos', COALESCE(
        (SELECT json_agg(c) FROM public.pessoa_contatos c WHERE c.pessoa_id = p.id),
        '[]'::json
      )
    )
  FROM public.pessoas p
  WHERE p.id = p_id;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.get_partner_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_partner_details(uuid) TO authenticated;
