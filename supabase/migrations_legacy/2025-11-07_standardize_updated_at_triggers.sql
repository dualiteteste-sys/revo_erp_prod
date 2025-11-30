-- =============================================================================
-- Migração: Padronizar triggers de updated_at (usar touch_updated_at)
-- Data: 2025-11-07
-- Objetivos:
--   - Garantir que todas as tabelas public.* com coluna updated_at tenham
--     BEFORE UPDATE trigger chamando public.touch_updated_at().
--   - Remover triggers legados que chamam public.tg_set_updated_at().
--   - Manter nome padronizado: tg_set_updated_at
-- Segurança:
--   - Não altera dados; apenas (re)cria triggers.
--   - Idempotente.
-- =============================================================================

DO $$
DECLARE
  v_touch_oid    oid;
  v_legacy_oid   oid;
  r RECORD;
  v_rel regclass;
  v_has_trigger boolean;
  v_wrong_func  boolean;
BEGIN
  -- OIDs das funções (se legacy não existir, segue nulo)
  SELECT 'public.touch_updated_at()'::regproc::oid INTO v_touch_oid;
  SELECT to_regprocedure('public.tg_set_updated_at()')::oid INTO v_legacy_oid;

  -- Loop em todas as tabelas do schema public que possuem coluna updated_at
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name  = 'updated_at'
      AND t.table_type   = 'BASE TABLE'
  LOOP
    v_rel := to_regclass(format('%I.%I', r.table_schema, r.table_name));

    -- Existe um trigger tg_set_updated_at nessa tabela?
    SELECT EXISTS (
      SELECT 1 FROM pg_trigger tg
      WHERE tg.tgrelid = v_rel
        AND tg.tgname  = 'tg_set_updated_at'
        AND NOT tg.tgisinternal
    ) INTO v_has_trigger;

    -- Se existir, ele aponta para a função correta?
    IF v_has_trigger THEN
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger tg
        WHERE tg.tgrelid = v_rel
          AND tg.tgname  = 'tg_set_updated_at'
          AND tg.tgfoid <> v_touch_oid
          AND NOT tg.tgisinternal
      ) INTO v_wrong_func;

      IF v_wrong_func THEN
        EXECUTE format('DROP TRIGGER IF EXISTS tg_set_updated_at ON %s', v_rel);
        EXECUTE format($f$
          CREATE TRIGGER tg_set_updated_at
          BEFORE UPDATE ON %s
          FOR EACH ROW
          EXECUTE FUNCTION public.touch_updated_at()
        $f$, v_rel);
      END IF;
    ELSE
      -- Não existe trigger: cria o padronizado
      EXECUTE format($f$
        CREATE TRIGGER tg_set_updated_at
        BEFORE UPDATE ON %s
        FOR EACH ROW
        EXECUTE FUNCTION public.touch_updated_at()
      $f$, v_rel);
    END IF;

    -- Remover triggers extras que ainda chamam a função legacy (se ela existir)
    IF v_legacy_oid IS NOT NULL THEN
      FOR v_rel IN
        SELECT format('%I.%I', r.table_schema, r.table_name)::regclass
      LOOP
        PERFORM 1; -- no-op só para type stability
      END LOOP;

      PERFORM
        CASE
          WHEN EXISTS (
            SELECT 1 FROM pg_trigger tg
            WHERE tg.tgrelid = v_rel
              AND tg.tgfoid  = v_legacy_oid
              AND tg.tgname <> 'tg_set_updated_at'
              AND NOT tg.tgisinternal
          )
          THEN 1 ELSE 0
        END;

      -- Drop de qualquer trigger (com nome diferente) que use a função legacy
      FOR r IN
        SELECT tg.tgname AS to_drop
        FROM pg_trigger tg
        WHERE tg.tgrelid = v_rel
          AND tg.tgfoid  = v_legacy_oid
          AND tg.tgname <> 'tg_set_updated_at'
          AND NOT tg.tgisinternal
      LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', r.to_drop, v_rel);
      END LOOP;
    END IF;
  END LOOP;

  PERFORM pg_notify('app_log', '[TRIGGER] updated_at normalized -> touch_updated_at() + tg_set_updated_at (public.*)');
END
$$ LANGUAGE plpgsql;

-- (Opcional) Remover função legacy se não for mais usada por NENHUM trigger
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
