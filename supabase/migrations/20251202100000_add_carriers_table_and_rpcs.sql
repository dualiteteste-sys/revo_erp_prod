/*
          # [Operation Name]
          Create Carriers Table and CRUD RPCs

          ## Query Description: [This operation creates the `transportadoras` table to store carrier information, enforces multi-tenancy with Row Level Security (RLS), and sets up secure Remote Procedure Calls (RPCs) for all create, update, and delete operations. It ensures that users can only interact with carriers belonging to their own company.]
          
          ## Metadata:
          - Schema-Category: ["Structural"]
          - Impact-Level: ["Low"]
          - Requires-Backup: [false]
          - Reversible: [true]
          
          ## Structure Details:
          - Tables Added: `public.transportadoras`
          - Columns: `id`, `empresa_id`, `nome`, `razao_social`, `cnpj`, `status`, `created_at`, `updated_at`
          - RLS Policies: `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies for `transportadoras`
          - Functions Added: `create_transportadora_for_current_user`, `update_transportadora_for_current_user`, `delete_transportadora_for_current_user`
          
          ## Security Implications:
          - RLS Status: [Enabled]
          - Policy Changes: [Yes]
          - Auth Requirements: [Requires authenticated user with membership in the target `empresa_id`]
          
          ## Performance Impact:
          - Indexes: [Primary Key index on `id`, Foreign Key index on `empresa_id`]
          - Triggers: [An `updated_at` trigger is applied.]
          - Estimated Impact: [Low. Standard table creation with secure access patterns.]
          */

-- 1. Create transportadoras table
CREATE TABLE public.transportadoras (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
    nome text NOT NULL,
    razao_social text NULL,
    cnpj text NULL,
    status public.status_produto NOT NULL DEFAULT 'ativo'::public.status_produto,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT transportadoras_pkey PRIMARY KEY (id),
    CONSTRAINT transportadoras_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE,
    CONSTRAINT transportadoras_empresa_id_cnpj_key UNIQUE (empresa_id, cnpj)
);

-- 2. Apply updated_at trigger
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.transportadoras
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Enable RLS
ALTER TABLE public.transportadoras ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
CREATE POLICY "Allow ALL for company members"
ON public.transportadoras
FOR ALL
USING (public.is_user_member_of(empresa_id))
WITH CHECK (public.is_user_member_of(empresa_id));


-- 5. Create RPC for CREATE
CREATE OR REPLACE FUNCTION public.create_transportadora_for_current_user(payload jsonb)
RETURNS public.transportadoras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  new_carrier public.transportadoras;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No active company found for the current user.';
  END IF;

  INSERT INTO public.transportadoras (empresa_id, nome, razao_social, cnpj, status)
  SELECT
    v_empresa_id,
    payload->>'nome',
    payload->>'razao_social',
    payload->>'cnpj',
    (payload->>'status')::public.status_produto
  RETURNING * INTO new_carrier;

  RETURN new_carrier;
END;
$$;

-- 6. Create RPC for UPDATE
CREATE OR REPLACE FUNCTION public.update_transportadora_for_current_user(p_id uuid, patch jsonb)
RETURNS public.transportadoras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_carrier public.transportadoras;
BEGIN
  UPDATE public.transportadoras
  SET
    nome = COALESCE(patch->>'nome', nome),
    razao_social = COALESCE(patch->>'razao_social', razao_social),
    cnpj = COALESCE(patch->>'cnpj', cnpj),
    status = COALESCE((patch->>'status')::public.status_produto, status)
  WHERE id = p_id
  RETURNING * INTO updated_carrier;

  IF updated_carrier IS NULL THEN
    RAISE EXCEPTION 'Carrier not found or permission denied.';
  END IF;

  RETURN updated_carrier;
END;
$$;

-- 7. Create RPC for DELETE
CREATE OR REPLACE FUNCTION public.delete_transportadora_for_current_user(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.transportadoras WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Carrier not found or permission denied.';
  END IF;
END;
$$;

-- 8. Grant permissions to authenticated role
GRANT EXECUTE ON FUNCTION public.create_transportadora_for_current_user(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transportadora_for_current_user(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_transportadora_for_current_user(uuid) TO authenticated;
