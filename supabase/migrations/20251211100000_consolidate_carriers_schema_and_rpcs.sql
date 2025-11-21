-- [DDL][TRANSPORTADORAS][CONSOLIDATE]
-- This script consolidates the creation of the carriers module into a single, idempotent file.
-- It fixes the "type already exists" error by using IF NOT EXISTS checks.

/*
# [Consolidate Carriers Module]
Creates the 'transportadoras' table, its associated type, RLS policies, and all CRUD RPCs in an idempotent way.

## Query Description:
This operation ensures the entire 'transportadoras' module schema is correctly set up. It is safe to run even if parts of the schema already exist, as it uses 'IF NOT EXISTS' and 'CREATE OR REPLACE' clauses. This will fix migration errors related to objects that already exist.

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Low"]
- Requires-Backup: false
- Reversible: false

## Structure Details:
- Type: public.status_transportadora
- Table: public.transportadoras
- Indexes: idx_transportadoras__empresa
- Trigger: tg_transportadoras__updated_at
- Policies: transportadoras_sel, transportadoras_ins, transportadoras_upd, transportadoras_del
- Functions: create_update_carrier, list_carriers, count_carriers, get_carrier_details, delete_carrier

## Security Implications:
- RLS Status: Enabled
- Policy Changes: Yes (creates/replaces all policies for the table)
- Auth Requirements: authenticated users who are members of the company.

## Performance Impact:
- Indexes: Creates index on 'empresa_id'.
- Triggers: Adds an 'updated_at' trigger.
- Estimated Impact: Low.
*/

-- 1. Create ENUM type if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_transportadora') THEN
        CREATE TYPE public.status_transportadora AS ENUM ('ativa', 'inativa');
    END IF;
END$$;

-- 2. Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.transportadoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_razao_social text NOT NULL,
  nome_fantasia text,
  cnpj text,
  inscr_estadual text,
  status public.status_transportadora NOT NULL DEFAULT 'ativa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_transportadoras_empresa_cnpj UNIQUE (empresa_id, cnpj)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_transportadoras__empresa ON public.transportadoras(empresa_id);

-- 4. updated_at trigger
DROP TRIGGER IF EXISTS tg_transportadoras__updated_at ON public.transportadoras;
CREATE TRIGGER tg_transportadoras__updated_at
  BEFORE UPDATE ON public.transportadoras
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5. RLS
ALTER TABLE public.transportadoras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transportadoras_sel ON public.transportadoras;
CREATE POLICY transportadoras_sel ON public.transportadoras
  FOR SELECT USING (public.is_user_member_of(empresa_id));

DROP POLICY IF EXISTS transportadoras_ins ON public.transportadoras;
CREATE POLICY transportadoras_ins ON public.transportadoras
  FOR INSERT WITH CHECK (public.is_user_member_of(empresa_id));

DROP POLICY IF EXISTS transportadoras_upd ON public.transportadoras;
CREATE POLICY transportadoras_upd ON public.transportadoras
  FOR UPDATE USING (public.is_user_member_of(empresa_id))
  WITH CHECK (public.is_user_member_of(empresa_id));

DROP POLICY IF EXISTS transportadoras_del ON public.transportadoras;
CREATE POLICY transportadoras_del ON public.transportadoras
  FOR DELETE USING (public.is_user_member_of(empresa_id));


-- 6. RPCs
-- [RPC][TRANSPORTADORAS] create_update_carrier
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
    RAISE insufficient_privilege USING MESSAGE = '[AUTH] Empresa não definida na sessão.';
  END IF;

  IF v_carrier_id IS NOT NULL THEN
    -- Update
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
      RAISE not_found USING MESSAGE = 'Transportadora não encontrada ou pertence a outra empresa.';
    END IF;
  ELSE
    -- Insert
    INSERT INTO public.transportadoras (
      empresa_id,
      nome_razao_social,
      nome_fantasia,
      cnpj,
      inscr_estadual,
      status
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
REVOKE EXECUTE ON FUNCTION public.create_update_carrier(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_update_carrier(jsonb) TO authenticated;

-- [RPC][TRANSPORTADORAS] list_carriers
CREATE OR REPLACE FUNCTION public.list_carriers(
    p_limit integer DEFAULT 10,
    p_offset integer DEFAULT 0,
    p_q text DEFAULT NULL,
    p_status public.status_transportadora DEFAULT NULL,
    p_order text DEFAULT 'nome_razao_social asc'
)
RETURNS TABLE(id uuid, nome_razao_social text, cnpj text, inscr_estadual text, status public.status_transportadora, created_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.nome_razao_social,
        t.cnpj,
        t.inscr_estadual,
        t.status,
        t.created_at
    FROM public.transportadoras t
    WHERE
        t.empresa_id = public.current_empresa_id()
        AND (p_status IS NULL OR t.status = p_status)
        AND (
            p_q IS NULL OR
            t.nome_razao_social ILIKE '%' || p_q || '%' OR
            t.nome_fantasia ILIKE '%' || p_q || '%' OR
            t.cnpj ILIKE '%' || p_q || '%'
        )
    ORDER BY
        CASE WHEN p_order = 'nome_razao_social asc' THEN t.nome_razao_social END ASC,
        CASE WHEN p_order = 'nome_razao_social desc' THEN t.nome_razao_social END DESC,
        t.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_carriers(integer, integer, text, public.status_transportadora, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_carriers(integer, integer, text, public.status_transportadora, text) TO authenticated;

-- [RPC][TRANSPORTADORAS] count_carriers
CREATE OR REPLACE FUNCTION public.count_carriers(
    p_q text DEFAULT NULL,
    p_status public.status_transportadora DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_count integer;
BEGIN
    SELECT count(*)::integer INTO v_count
    FROM public.transportadoras t
    WHERE
        t.empresa_id = public.current_empresa_id()
        AND (p_status IS NULL OR t.status = p_status)
        AND (
            p_q IS NULL OR
            t.nome_razao_social ILIKE '%' || p_q || '%' OR
            t.nome_fantasia ILIKE '%' || p_q || '%' OR
            t.cnpj ILIKE '%' || p_q || '%'
        );
    RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.count_carriers(text, public.status_transportadora) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_carriers(text, public.status_transportadora) TO authenticated;

-- [RPC][TRANSPORTADORAS] get_carrier_details
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
        RAISE not_found USING MESSAGE = 'Transportadora não encontrada.';
    END IF;

    RETURN v_carrier;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_carrier_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_carrier_details(uuid) TO authenticated;

-- [RPC][TRANSPORTADORAS] delete_carrier
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
    RAISE insufficient_privilege USING MESSAGE = '[AUTH] Empresa não definida na sessão.';
  END IF;

  DELETE FROM public.transportadoras
  WHERE id = p_id AND empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE not_found USING MESSAGE = 'Transportadora não encontrada ou pertence a outra empresa.';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_carrier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_carrier(uuid) TO authenticated;
