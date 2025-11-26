-- 2025-11-26 - Auto drop de índices BTREE duplicados por (mesmas colunas na mesma ordem, mesma unicidade)
-- Escopo: schema public; ignora PK, índices parciais, índices por expressão e não-BTREE.
-- Modo de uso:
--   (1) Rode este arquivo como está para APENAS visualizar o que será dropado (prévia).
--   (2) Se estiver ok, DESCOMENTE a linha `\gexec` na seção (2) para executar os DROPs.
-- Segurança: não toca PRIMARY KEY / UNIQUE CONSTRAINT; usa DROP INDEX CONCURRENTLY fora de transação.
-- search_path defensivo
SET search_path = pg_catalog, public;

-- ==================================================================================================
-- (1) Prévia dos grupos duplicados e escolha do índice que será mantido
-- ==================================================================================================
WITH idx AS (
  SELECT
    n.nspname                                   AS schema_name,
    c.relname                                   AS table_name,
    i.relname                                   AS index_name,
    am.amname                                   AS am_method,
    ix.indisunique                              AS is_unique,
    ix.indisprimary                             AS is_primary,
    ix.indisvalid                               AS is_valid,
    ix.indexrelid                               AS index_oid,
    ARRAY_AGG(a.attname ORDER BY ord.attnum)    AS cols
  FROM pg_index ix
  JOIN pg_class i       ON i.oid = ix.indexrelid
  JOIN pg_class c       ON c.oid = ix.indrelid
  JOIN pg_namespace n   ON n.oid = c.relnamespace
  JOIN pg_am am         ON am.oid = i.relam
  -- somente índices sobre colunas (sem expressões) -> indexprs NULL
  LEFT JOIN LATERAL (
    SELECT attnum FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, pos)
    WHERE attnum <> 0
  ) ord ON TRUE
  LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ord.attnum
  WHERE n.nspname = 'public'
    AND am.amname = 'btree'
    AND NOT ix.indisprimary
    AND ix.indpred IS NULL           -- não parciais
    AND ix.indexprs IS NULL          -- sem expressões
  GROUP BY n.nspname, c.relname, i.relname, am.amname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indexrelid
),
groups AS (
  SELECT
    schema_name, table_name, is_unique, cols,
    ARRAY_AGG(index_name ORDER BY index_name)                 AS indexes,
    COUNT(*)                                                  AS dup_count
  FROM idx
  GROUP BY schema_name, table_name, is_unique, cols
  HAVING COUNT(*) > 1
),
choices AS (
  -- escolhe 1 índice por grupo para manter, por heurística de nome
  SELECT g.schema_name, g.table_name, g.is_unique, g.cols, g.indexes, g.dup_count,
         -- pega o índice com melhor score
         (SELECT ix.index_name
            FROM idx ix
           WHERE ix.schema_name = g.schema_name
             AND ix.table_name  = g.table_name
             AND ix.is_unique   = g.is_unique
             AND ix.cols        = g.cols
           ORDER BY
             -- preferências de nome (ajuste conforme seu padrão)
             CASE
               WHEN ix.index_name ~* '(uniq|unique)' THEN 0
               WHEN ix.index_name LIKE 'idx\_fk\_%'  THEN 1
               ELSE 2
             END,
             ix.index_name
           LIMIT 1) AS keep_index
  FROM groups g
)
SELECT
  schema_name,
  table_name,
  is_unique,
  cols::text        AS cols_signature,
  dup_count         AS duplicates_in_group,
  keep_index,
  (SELECT ARRAY_AGG(i) FROM unnest(indexes) AS t(i) WHERE i <> keep_index) AS drop_indexes
FROM choices
ORDER BY schema_name, table_name, cols::text;

-- ==================================================================================================
-- (2) Comandos de DROP gerados (revise acima antes).
--     Para executar automaticamente, descomente a linha '\gexec' logo após a query.
-- ==================================================================================================
WITH idx AS (
  SELECT
    n.nspname                                   AS schema_name,
    c.relname                                   AS table_name,
    i.relname                                   AS index_name,
    am.amname                                   AS am_method,
    ix.indisunique                              AS is_unique,
    ix.indisprimary                             AS is_primary,
    ix.indisvalid                               AS is_valid,
    ix.indexrelid                               AS index_oid,
    ARRAY_AGG(a.attname ORDER BY ord.attnum)    AS cols
  FROM pg_index ix
  JOIN pg_class i       ON i.oid = ix.indexrelid
  JOIN pg_class c       ON c.oid = ix.indrelid
  JOIN pg_namespace n   ON n.oid = c.relnamespace
  JOIN pg_am am         ON am.oid = i.relam
  LEFT JOIN LATERAL (
    SELECT attnum FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, pos)
    WHERE attnum <> 0
  ) ord ON TRUE
  LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ord.attnum
  WHERE n.nspname = 'public'
    AND am.amname = 'btree'
    AND NOT ix.indisprimary
    AND ix.indpred IS NULL
    AND ix.indexprs IS NULL
  GROUP BY n.nspname, c.relname, i.relname, am.amname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indexrelid
),
groups AS (
  SELECT
    schema_name, table_name, is_unique, cols,
    ARRAY_AGG(index_name ORDER BY index_name)                 AS indexes,
    COUNT(*)                                                  AS dup_count
  FROM idx
  GROUP BY schema_name, table_name, is_unique, cols
  HAVING COUNT(*) > 1
),
choices AS (
  SELECT g.schema_name, g.table_name, g.is_unique, g.cols, g.indexes,
         (SELECT ix.index_name
            FROM idx ix
           WHERE ix.schema_name = g.schema_name
             AND ix.table_name  = g.table_name
             AND ix.is_unique   = g.is_unique
             AND ix.cols        = g.cols
           ORDER BY
             CASE
               WHEN ix.index_name ~* '(uniq|unique)' THEN 0
               WHEN ix.index_name LIKE 'idx\_fk\_%'  THEN 1
               ELSE 2
             END,
             ix.index_name
           LIMIT 1) AS keep_index
  FROM groups g
),
to_drop AS (
  SELECT schema_name,
         (unnest(indexes)) AS index_name,
         keep_index
  FROM choices
)
SELECT
  FORMAT('DROP INDEX CONCURRENTLY IF EXISTS %I.%I;', schema_name, index_name) AS drop_sql
FROM to_drop
WHERE index_name <> keep_index
ORDER BY schema_name, index_name;

-- \gexec  -- << DESCOMENTE para executar os DROPs gerados

