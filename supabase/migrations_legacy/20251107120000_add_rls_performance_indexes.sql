-- =============================================================================
-- Migração: Índices em empresa_id (normalização de performance RLS)
-- Data: 2025-11-07
-- Objetivo: garantir índice em public.empresa_features, produto_anuncios,
--           produto_componentes, produto_fornecedores, produto_imagens
-- Regra de nome: idx_&lt;tabela&gt;__empresa_id
-- Idempotente: só cria se não houver NENHUM índice (qualquer nome) na coluna.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'public.empresa_features',
      'public.produto_anuncios',
      'public.produto_componentes',
      'public.produto_fornecedores',
      'public.produto_imagens'
    ]) AS fqtn
  LOOP
    -- cria idx_&lt;tabela&gt;__empresa_id apenas se NÃO existir índice na coluna empresa_id
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class       c
      JOIN pg_namespace   n   ON n.oid = c.relnamespace
      JOIN pg_index       i   ON i.indrelid = c.oid
      JOIN pg_class       ic  ON ic.oid = i.indexrelid
      JOIN LATERAL (
        SELECT string_agg(a.attname, ',' ORDER BY ord) AS cols
        FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      ) col ON TRUE
      WHERE format('%I.%I', n.nspname, c.relname) = r.fqtn
        AND POSITION('empresa_id' IN col.cols) > 0
    ) THEN
      EXECUTE format(
        'CREATE INDEX %I ON %s (empresa_id)',
        replace(split_part(r.fqtn, '.', 2), '"','') || '__empresa_id',
        r.fqtn
      );
      PERFORM pg_notify('app_log', '[INDEX] criado: ' ||
                        replace(split_part(r.fqtn, '.', 2), '"','') || ' (empresa_id)');
    ELSE
      PERFORM pg_notify('app_log', '[INDEX] existente: ' ||
                        replace(split_part(r.fqtn, '.', 2), '"','') || ' (empresa_id)');
    END IF;
  END LOOP;
END
$$ LANGUAGE plpgsql;

-- Smoke-check (opcional)
-- SELECT n.nspname AS schema, c.relname AS table, ic.relname AS index_name
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- JOIN pg_index i ON i.indrelid = c.oid
-- JOIN pg_class ic ON ic.oid = i.indexrelid
-- WHERE n.nspname = 'public'
--   AND c.relname IN ('empresa_features','produto_anuncios','produto_componentes','produto_fornecedores','produto_imagens')
-- ORDER BY table, index_name;
