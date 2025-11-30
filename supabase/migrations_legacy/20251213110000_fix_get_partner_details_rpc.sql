-- [RPC] PARCEIROS: get_partner_details - CORREÇÃO FINAL
/*
          # [Operation Name]
          Fix Get Partner Details RPC

          ## Query Description: [This operation replaces the `get_partner_details` function to fix a return type mismatch. The new function returns a single, stable JSON object, making it more robust against future table changes. This resolves the "structure of query does not match function result type" error.]
          
          ## Metadata:
          - Schema-Category: "Structural"
          - Impact-Level: "Low"
          - Requires-Backup: false
          - Reversible: false
          
          ## Structure Details:
          - Replaces function: `public.get_partner_details(uuid)`
          
          ## Security Implications:
          - RLS Status: Not changed
          - Policy Changes: No
          - Auth Requirements: `authenticated` role
          
          ## Performance Impact:
          - Indexes: Not changed
          - Triggers: Not changed
          - Estimated Impact: Negligible performance impact.
          */
-- Remove a função antiga para evitar conflito de tipo de retorno.
DROP FUNCTION IF EXISTS public.get_partner_details(uuid);

-- Recria a função retornando um único objeto JSON plano.
CREATE OR REPLACE FUNCTION public.get_partner_details(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid;
  result json;
BEGIN
  -- Get the active company for the current user
  SELECT a.empresa_id INTO v_empresa_id
  FROM public.user_active_empresa a
  WHERE a.user_id = public.current_user_id();

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa encontrada para o usuário.';
  END IF;

  -- Fetch the partner details as a single, flat JSON object
  SELECT
    json_strip_nulls(
      (
        SELECT to_jsonb(p) || jsonb_build_object(
          'enderecos', COALESCE((SELECT jsonb_agg(pe) FROM public.pessoa_enderecos pe WHERE pe.pessoa_id = p.id), '[]'::jsonb),
          'contatos', COALESCE((SELECT jsonb_agg(pc) FROM public.pessoa_contatos pc WHERE pc.pessoa_id = p.id), '[]'::jsonb)
        )
        FROM public.pessoas p
        WHERE p.id = p_id AND p.empresa_id = v_empresa_id
      )
    )
  INTO result;

  RETURN result;
END;
$$;

-- Garante que a função seja executável pelo usuário autenticado
GRANT EXECUTE ON FUNCTION public.get_partner_details(uuid) TO authenticated;
