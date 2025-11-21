-- =============================================================================
-- Migração: Criar touch_updated_at() e padronizar triggers de updated_at (versão robusta)
-- Data: 2025-11-07
-- =============================================================================

-- 1) Garante a função pública (não depende de OID/regproc no bloco DO)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'pg_catalog','public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.updated_at IS NULL THEN
      NEW.updated_at := now();
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- 2) Padroniza triggers em todas as tabelas public.* com coluna updated_at
DO $$
DECLARE
  r_tbl RECORD;
  r_drop RECORD;
  v_rel regclass;
BEGIN
  FOR r_tbl IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name  = 'updated_at'
      AND t.table_type   = 'BASE TABLE'
  LOOP
    v_rel := to_regclass(format('%I.%I', r_tbl.table_schema, r_tbl.table_name));

    -- (re)cria SEMPRE o trigger padrão, garantindo função correta
    EXECUTE format('DROP TRIGGER IF EXISTS tg_set_updated_at ON %s', v_rel);
    EXECUTE format($f$
      CREATE TRIGGER tg_set_updated_at
      BEFORE UPDATE ON %s
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_updated_at()
    $f$, v_rel);

    -- Remove qualquer outro trigger que chame touch_updated_at() ou a legacy tg_set_updated_at()
    -- (evita duplicidade, independentemente do nome do trigger)
    FOR r_drop IN
      SELECT tg.tgname AS to_drop
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE tg.tgrelid = v_rel
        AND NOT tg.tgisinternal
        AND tg.tgname <> 'tg_set_updated_at'
        AND n.nspname = 'public'
        AND p.proname IN ('touch_updated_at','tg_set_updated_at')
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', r_drop.to_drop, v_rel);
    END LOOP;
  END LOOP;

  PERFORM pg_notify('app_log',
    '[TRIGGER] normalized: tg_set_updated_at -> touch_updated_at() em public.* (versão robusta)'
  );
END
$$ LANGUAGE plpgsql;

-- 3) (Opcional) Drop da função legacy se ninguém mais usa
DO $$
DECLARE
  v_legacy_oid oid := to_regprocedure('public.tg_set_updated_at()')::oid;
  v_in_use boolean;
BEGIN
  IF v_legacy_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgfoid = v_legacy_oid AND NOT tgisinternal
  ) INTO v_in_use;

  IF NOT v_in_use THEN
    EXECUTE 'DROP FUNCTION IF EXISTS public.tg_set_updated_at()';
    PERFORM pg_notify('app_log', '[TRIGGER] dropped legacy function public.tg_set_updated_at()');
  END IF;
END
$$ LANGUAGE plpgsql;
