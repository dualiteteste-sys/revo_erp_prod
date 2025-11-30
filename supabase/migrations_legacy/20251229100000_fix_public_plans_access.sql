/*
  # [LANDING][PUBLIC READ] Fix public access to plans table
  This migration adjusts the Row Level Security (RLS) policies and grants to allow anonymous users to read the `public.plans` table, which is necessary for the landing page. It also hardens the `current_user_id` function for better security.

  ## Query Description:
  - **Grants**: It grants `USAGE` on the `public` schema and `SELECT` on the `public.plans` table to the `anon` role.
  - **RLS Policy**: It replaces any existing read policies on `public.plans` with a new, simpler policy that only allows selecting `active` plans, without depending on any user session context (JWT).
  - **Function Hardening**: It reinforces the `public.current_user_id` function to be a `SECURITY DEFINER`, preventing potential context-related errors in other parts of the application.
  - **Schema Reload**: It notifies PostgREST to reload its schema cache, applying the changes immediately.

  This operation is safe and idempotent. It does not affect existing data and is crucial for the public-facing pricing page to function correctly.

  ## Metadata:
  - Schema-Category: "Structural"
  - Impact-Level: "Low"
  - Requires-Backup: false
  - Reversible: true

  ## Structure Details:
  - Tables affected: `public.plans`
  - Functions affected: `public.current_user_id`
  - Policies affected: read policies on `public.plans`

  ## Security Implications:
  - RLS Status: Enabled on `public.plans`.
  - Policy Changes: Yes, a new `plans_public_read_active` policy is created.
  - Auth Requirements: Anonymous access is explicitly granted for `SELECT` on `public.plans`.

  ## Performance Impact:
  - Indexes: None
  - Triggers: None
  - Estimated Impact: Negligible. The new policy is simpler than any potential previous one.
*/

-- 0) Ativar RLS na tabela (idempotente)
ALTER TABLE IF EXISTS public.plans ENABLE ROW LEVEL SECURITY;

-- 1) Garantir permissões de leitura para anônimos
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.plans TO anon, authenticated;

-- 2) Remover policies antigas conflitantes (defensivo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='plans' AND policyname='plans_public_read'
  ) THEN
    EXECUTE 'DROP POLICY plans_public_read ON public.plans';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='plans' AND policyname='plans_public_read_active'
  ) THEN
    EXECUTE 'DROP POLICY plans_public_read_active ON public.plans';
  END IF;
END$$;

-- 3) Policy mínima para landing (SEM FUNÇÕES):
CREATE POLICY plans_public_read_active
  ON public.plans
  FOR SELECT
  TO anon, authenticated
  USING (active = true);

-- 4) (Opcional, mas recomendado) Harden em current_user_id()
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
      NULLIF((current_setting('request.jwt.claims', true))::jsonb ->> 'sub', '')::uuid
    )::uuid;
$$;

REVOKE ALL ON FUNCTION public.current_user_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO anon, authenticated, service_role;

-- 5) Reload do schema no PostgREST (efeito imediato na API)
NOTIFY pgrst, 'reload schema';
