-- =============================================================================
-- Migração: Índices em empresa_id (pular views)
-- Data: 2025-11-07
-- Objetivo: criar idx_&lt;tabela&gt;__empresa_id apenas em TABELAS com coluna empresa_id
--           (pula views como public.empresa_features)
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      n.nspname  AS schema_name,
      c.relname  AS table_name,
      format('%I.%I', n.nspname, c.relname) AS fqtn
    FROM unnest(ARRAY[
      'public.empresa_features',      -- pode ser VIEW -&gt; será pulada
      'public.produto_anuncios',
      'public.produto_componentes',
      'public.produto_fornecedores',
      'public.produto_imagens'
    ]) AS q(fqtn_text)
    JOIN pg_namespace n
      ON n.nspname = split_part(q.fqtn_text, '.', 1)
    JOIN pg_class c
      ON c.relnamespace = n.oid
     AND c.relname     = split_part(q.fqtn_text, '.', 2)
    WHERE c.relkind = 'r'  -- apenas BASE TABLE
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns col
        WHERE col.table_schema = n.nspname
          AND col.table_name   = c.relname
          AND col.column_name  = 'empresa_id'
      )
  LOOP
    -- cria idx_&lt;tabela&gt;__empresa_id apenas se NÃO houver índice que inclua empresa_id
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid
       AND a.attnum   = ANY(i.indkey)
      WHERE i.indrelid = (r.fqtn)::regclass
        AND a.attname  = 'empresa_id'
    ) THEN
      EXECUTE format(
        'CREATE INDEX %I ON %s (empresa_id)',
        r.table_name || '__empresa_id',
        r.fqtn
      );
      PERFORM pg_notify('app_log', '[INDEX] criado: ' || r.fqtn || ' (empresa_id)');
    ELSE
      PERFORM pg_notify('app_log', '[INDEX] existente: ' || r.fqtn || ' (empresa_id)');
    END IF;
  END LOOP;
END
$$ LANGUAGE plpgsql;

-- (Opcional) Smoke-check
-- SELECT n.nspname AS schema, c.relname AS table, ic.relname AS index_name
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- JOIN pg_index i ON i.indrelid = c.oid
-- JOIN pg_class ic ON ic.oid = i.indexrelid
-- WHERE n.nspname = 'public'
--   AND c.relname IN ('empresa_features','produto_anuncios','produto_componentes','produto_fornecedores','produto_imagens')
-- ORDER BY table, index_name;
