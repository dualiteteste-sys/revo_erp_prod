-- =============================================================================
-- Migração: Criar touch_updated_at() e padronizar triggers de updated_at
-- Data: 2025-11-07
-- Objetivos:
--   1) Criar/atualizar a função public.touch_updated_at().
--   2) Garantir que todas as tabelas public.* com coluna updated_at tenham
--      APENAS o trigger padronizado: tg_set_updated_at -> touch_updated_at().
--   3) Remover triggers duplicados/legados.
-- Segurança: sem alterações de dados.
-- =============================================================================

-- 1) Função padronizada para atualizar updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'pg_catalog','public'
AS $$
BEGIN
  -- Usamos NOW() (timestamptz) para consistência com colunas timestamptz
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  ELSIF TG_OP = 'INSERT' THEN
    -- Caso alguém queira reaproveitar a função em BEFORE INSERT
    IF NEW.updated_at IS NULL THEN
      NEW.updated_at := now();
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- 2) Padronizar triggers de updated_at em todas as tabelas public.* com a coluna
DO $$
DECLARE
  v_touch_oid   oid := 'public.touch_updated_at()'::regproc::oid;
  v_legacy_oid  oid := to_regprocedure('public.tg_set_updated_at()')::oid;  -- pode ser NULL
  r_tbl RECORD;
  r_drop RECORD;
  v_rel regclass;
  v_has_trigger boolean;
  v_wrong_func  boolean;
BEGIN
  -- Percorre todas as BASE TABLES do schema public que possuem coluna updated_at
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

    -- Verifica se já existe o trigger padronizado
    SELECT EXISTS (
      SELECT 1
      FROM pg_trigger tg
      WHERE tg.tgrelid = v_rel
        AND tg.tgname  = 'tg_set_updated_at'
        AND NOT tg.tgisinternal
    ) INTO v_has_trigger;

    IF v_has_trigger THEN
      -- Se existir, garante que aponta para a função correta
      SELECT EXISTS (
        SELECT 1
        FROM pg_trigger tg
        WHERE tg.tgrelid = v_rel
          AND tg.tgname  = 'tg_set_updated_at'
          AND tg.tgfoid &lt;&gt; v_touch_oid
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
      -- Cria o trigger padronizado se não existir
      EXECUTE format($f$
        CREATE TRIGGER tg_set_updated_at
        BEFORE UPDATE ON %s
        FOR EACH ROW
        EXECUTE FUNCTION public.touch_updated_at()
      $f$, v_rel);
    END IF;

    -- Remove QUALQUER outro trigger (nome != tg_set_updated_at) que aponte
    -- para a função correta OU para a função legacy (evita duplicidade).
    FOR r_drop IN
      SELECT tg.tgname AS to_drop
      FROM pg_trigger tg
      WHERE tg.tgrelid = v_rel
        AND NOT tg.tgisinternal
        AND tg.tgname &lt;&gt; 'tg_set_updated_at'
        AND (
          tg.tgfoid = v_touch_oid
          OR (v_legacy_oid IS NOT NULL AND tg.tgfoid = v_legacy_oid)
        )
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', r_drop.to_drop, v_rel);
    END LOOP;
  END LOOP;

  PERFORM pg_notify('app_log',
    '[TRIGGER] normalized: tg_set_updated_at -> touch_updated_at() em public.*');
END
$$ LANGUAGE plpgsql;

-- 3) (Opcional) Remover função legacy se nenhum trigger mais usar
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
