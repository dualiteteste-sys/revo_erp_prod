-- =============================================================================
-- Migração: Padronizar triggers de updated_at (usar touch_updated_at)
-- Data: 2025-11-07
-- Objetivos:
--   - Garantir que todas as tabelas public.* com coluna updated_at tenham
--     BEFORE UPDATE trigger chamando public.touch_updated_at().
--   - Remover triggers legados/duplicados (quaisquer nomes) que chamem
--     public.tg_set_updated_at() (legacy) OU public.touch_updated_at() (correta),
--     preservando apenas o padronizado: tg_set_updated_at.
-- Segurança: não altera dados; apenas (re)cria triggers. Idempotente.
-- =============================================================================

DO $$
DECLARE
  v_touch_oid   oid := 'public.touch_updated_at()'::regproc::oid;
  v_legacy_oid  oid := to_regprocedure('public.tg_set_updated_at()')::oid;
  r_tbl RECORD;
  r_drop RECORD;
  v_rel regclass;
  v_has_trigger boolean;
  v_wrong_func  boolean;
BEGIN
  -- Loop em todas as tabelas do schema public que possuem coluna updated_at
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

    -- 1) (Re)criar o trigger padronizado, se ausente ou apontando p/ função errada
    SELECT EXISTS (
      SELECT 1 FROM pg_trigger tg
      WHERE tg.tgrelid = v_rel
        AND tg.tgname  = 'tg_set_updated_at'
        AND NOT tg.tgisinternal
    ) INTO v_has_trigger;

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
      EXECUTE format($f$
        CREATE TRIGGER tg_set_updated_at
        BEFORE UPDATE ON %s
        FOR EACH ROW
        EXECUTE FUNCTION public.touch_updated_at()
      $f$, v_rel);
    END IF;

    -- 2) Remover QUALQUER outro trigger (nome diferente de tg_set_updated_at)
    --    que chame a função legacy OU a função correta (evita duplicidade).
    FOR r_drop IN
      SELECT tg.tgname AS to_drop
      FROM pg_trigger tg
      WHERE tg.tgrelid = v_rel
        AND NOT tg.tgisinternal
        AND tg.tgname <> 'tg_set_updated_at'
        AND (
          tg.tgfoid = v_touch_oid
          OR (v_legacy_oid IS NOT NULL AND tg.tgfoid = v_legacy_oid)
        )
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', r_drop.to_drop, v_rel);
    END LOOP;
  END LOOP;

  PERFORM pg_notify('app_log', '[TRIGGER] updated_at normalized: tg_set_updated_at -> touch_updated_at() (limpeza de duplicatas/legacy)');
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
