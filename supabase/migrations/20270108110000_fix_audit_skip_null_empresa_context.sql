-- FIX: auditoria não deve quebrar migrations/seeds globais
--
-- Contexto:
-- - Tabelas globais (ex.: roles/role_permissions) não possuem empresa_id.
-- - Quando `public.current_empresa_id()` é NULL (ex.: durante migrations em clean slate),
--   o trigger `process_audit_log()` tentava inserir em `audit_logs.empresa_id NOT NULL`,
--   causando erro 23502 e quebrando `supabase db push`.
--
-- Estratégia:
-- - Se `v_empresa_id` for NULL, apenas não logar (best-effort) e retornar o registro.

BEGIN;

CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid;
    v_old_data jsonb;
    v_new_data jsonb;
    v_record_id uuid;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := null;

        BEGIN
            v_record_id := OLD.id;
        EXCEPTION WHEN OTHERS THEN
            v_record_id := null;
        END;

        BEGIN
            v_empresa_id := OLD.empresa_id;
        EXCEPTION WHEN OTHERS THEN
            v_empresa_id := public.current_empresa_id();
        END;
    ELSE
        v_new_data := to_jsonb(NEW);

        IF (TG_OP = 'UPDATE') THEN
            v_old_data := to_jsonb(OLD);
        ELSE
            v_old_data := null;
        END IF;

        BEGIN
            v_record_id := NEW.id;
        EXCEPTION WHEN OTHERS THEN
            v_record_id := null;
        END;

        BEGIN
            v_empresa_id := NEW.empresa_id;
        EXCEPTION WHEN OTHERS THEN
            v_empresa_id := public.current_empresa_id();
        END;
    END IF;

    IF (TG_OP = 'UPDATE' AND v_old_data = v_new_data) THEN
        RETURN NEW;
    END IF;

    -- Sem contexto de empresa (migrations/seeds globais), não logar para evitar violar NOT NULL.
    IF v_empresa_id IS NULL THEN
        IF (TG_OP = 'DELETE') THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

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

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

