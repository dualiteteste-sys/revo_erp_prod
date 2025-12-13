-- Audit Logs System
-- Compliance 10/10

BEGIN;

-- 1. Create Audit Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    table_name text NOT NULL,
    record_id uuid, -- Can be NULL if partial PK or complex, practically usually the ID
    operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data jsonb,
    new_data jsonb,
    changed_by uuid DEFAULT auth.uid(),
    changed_at timestamptz DEFAULT now()
);

-- 2. Security / RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only Allow Read for same company
CREATE POLICY "Enable read access for company users" ON public.audit_logs
    FOR SELECT USING (empresa_id = public.current_empresa_id());

-- Disable direct modifications by users (System only via Trigger)
CREATE POLICY "Deny direct insert" ON public.audit_logs
    FOR INSERT WITH CHECK (false);

CREATE POLICY "Deny direct update" ON public.audit_logs
    FOR UPDATE USING (false);

CREATE POLICY "Deny direct delete" ON public.audit_logs
    FOR DELETE USING (false);


-- 3. Generic Trigger Function
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Essential to bypass "Deny direct insert" policy
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid;
    v_old_data jsonb;
    v_new_data jsonb;
    v_record_id uuid;
BEGIN
    -- Attempt to get empresa_id from the record
    -- Fallback to current_empresa_id() if not present in the row
    IF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := null;
        
        -- Try to extract ID and EMPRESA_ID safely
        BEGIN 
            v_record_id := OLD.id; 
        EXCEPTION WHEN OTHERS THEN v_record_id := null; END;
        
        BEGIN 
            v_empresa_id := OLD.empresa_id; 
        EXCEPTION WHEN OTHERS THEN v_empresa_id := public.current_empresa_id(); END;
    ELSE
        -- INSERT or UPDATE
        v_new_data := to_jsonb(NEW);
        
        IF (TG_OP = 'UPDATE') THEN
            v_old_data := to_jsonb(OLD);
        ELSE
            v_old_data := null; -- INSERT
        END IF;

        BEGIN 
            v_record_id := NEW.id; 
        EXCEPTION WHEN OTHERS THEN v_record_id := null; END;

        BEGIN 
            v_empresa_id := NEW.empresa_id; 
        EXCEPTION WHEN OTHERS THEN v_empresa_id := public.current_empresa_id(); END;
    END IF;

    -- Avoid logging if no changes (for UPDATE)
    IF (TG_OP = 'UPDATE' AND v_old_data = v_new_data) THEN
        RETURN NEW;
    END IF;

    -- Insert Log
    INSERT INTO public.audit_logs (
        empresa_id,
        table_name,
        record_id,
        operation,
        old_data,
        new_data,
        changed_by
    ) VALUES (
        v_empresa_id,
        TG_TABLE_NAME::text,
        v_record_id,
        TG_OP,
        v_old_data,
        v_new_data,
        auth.uid()
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


-- 4. Apply Triggers to Critical Tables

DO $$
BEGIN
    IF to_regclass('public.produtos') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.produtos';
        EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.pessoas') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.pessoas';
        EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.pessoas FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.industria_producao_ordens') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_producao_ordens';
        EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_producao_ordens FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.financeiro_contas_receber') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.financeiro_contas_receber';
        EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.financeiro_contas_receber FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.financeiro_contas_pagar') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.financeiro_contas_pagar';
        EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.financeiro_contas_pagar FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
    END IF;
END;
$$;

COMMIT;
