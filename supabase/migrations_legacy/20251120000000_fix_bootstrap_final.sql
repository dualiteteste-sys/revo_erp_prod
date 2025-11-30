-- =============================================================================
-- Fix: Bootstrap Stability & Recursion Prevention
-- Motivo: 503 Errors (Connection Refused) during bootstrap, likely due to recursion or crash.
-- Ação: 
-- 1. Redefine is_user_member_of to be simple, non-recursive, and SECURITY DEFINER.
-- 2. Redefine bootstrap_empresa_for_current_user to be robust and log progress.
-- =============================================================================

-- 1. Fix is_user_member_of to avoid any potential recursion with RLS
CREATE OR REPLACE FUNCTION public.is_user_member_of(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Run as owner (postgres) to bypass RLS on empresa_usuarios
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Direct check on empresa_usuarios, bypassing RLS due to SECURITY DEFINER
  RETURN EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = public.current_user_id() -- Uses JWT sub
  );
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.is_user_member_of(uuid) TO authenticated, service_role;


-- 2. Fix bootstrap_empresa_for_current_user
DROP FUNCTION IF EXISTS public.bootstrap_empresa_for_current_user(text, text);

CREATE OR REPLACE FUNCTION public.bootstrap_empresa_for_current_user(
    p_razao_social text DEFAULT NULL,
    p_fantasia     text DEFAULT NULL
)
RETURNS TABLE(empresa_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id    uuid := public.current_user_id();
    v_empresa_id uuid;
    v_exists     boolean;
BEGIN
    -- Log start
    PERFORM pg_notify('app_log', '[BOOTSTRAP] Starting for user: ' || COALESCE(v_user_id::text, 'NULL'));

    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, 'error_unauthenticated'::text;
        RETURN;
    END IF;

    -- 1) Check active company (Direct query, no RLS issues due to SD)
    SELECT uae.empresa_id
      INTO v_empresa_id
      FROM public.user_active_empresa uae
     WHERE uae.user_id = v_user_id
     ORDER BY uae.updated_at DESC NULLS LAST
     LIMIT 1;

    IF v_empresa_id IS NOT NULL THEN
        PERFORM pg_notify('app_log', '[BOOTSTRAP] Found active company: ' || v_empresa_id::text);
        RETURN QUERY SELECT v_empresa_id, 'already_active'::text;
        RETURN;
    END IF;

    -- 2) Check membership
    SELECT eu.empresa_id
      INTO v_empresa_id
      FROM public.empresa_usuarios eu
     WHERE eu.user_id = v_user_id
     LIMIT 1;

    IF v_empresa_id IS NOT NULL THEN
        PERFORM pg_notify('app_log', '[BOOTSTRAP] Found existing membership: ' || v_empresa_id::text);
        
        -- Set active
        INSERT INTO public.user_active_empresa (user_id, empresa_id)
        VALUES (v_user_id, v_empresa_id)
        ON CONFLICT (user_id)
        DO UPDATE SET empresa_id = EXCLUDED.empresa_id, updated_at = now();

        RETURN QUERY SELECT v_empresa_id, 'activated_existing'::text;
        RETURN;
    END IF;

    -- 3) Create new company
    PERFORM pg_notify('app_log', '[BOOTSTRAP] Creating new company');
    
    INSERT INTO public.empresas (razao_social, fantasia)
    VALUES (
        COALESCE(p_razao_social, 'Minha Empresa'),
        COALESCE(p_fantasia, p_razao_social, 'Minha Empresa')
    )
    RETURNING id INTO v_empresa_id;

    PERFORM pg_notify('app_log', '[BOOTSTRAP] Company created: ' || v_empresa_id::text);

    -- Link user (Owner)
    INSERT INTO public.empresa_usuarios (empresa_id, user_id, status)
    VALUES (v_empresa_id, v_user_id, 'ACTIVE') -- Explicitly set status if column exists
    ON CONFLICT DO NOTHING;

    -- Set active
    INSERT INTO public.user_active_empresa (user_id, empresa_id)
    VALUES (v_user_id, v_empresa_id)
    ON CONFLICT (user_id)
    DO UPDATE SET empresa_id = EXCLUDED.empresa_id, updated_at = now();

    RETURN QUERY SELECT v_empresa_id, 'created_new'::text;
EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('app_log', '[BOOTSTRAP] Error: ' || SQLERRM);
    -- Return error status instead of raising exception to prevent 503 loops if possible
    RETURN QUERY SELECT NULL::uuid, 'error_internal: ' || SQLERRM;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.bootstrap_empresa_for_current_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_empresa_for_current_user(text, text) TO authenticated, service_role;

-- Cache reload
SELECT pg_notify('pgrst','reload schema');
