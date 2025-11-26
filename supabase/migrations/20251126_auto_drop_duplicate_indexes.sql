
-- 2025-11-26: Auto-drop de índices BTREE duplicados no schema public
-- Requisitos: executar via psql (usa \gexec). Não roda DROP ... CONCURRENTLY dentro de BEGIN/COMMIT.
-- Segurança: só remove duplicatas exatas (mesmo conjunto ordenado de colunas, mesma unicidade, mesmo AM).
-- Compatibilidade: ignora PKs e índices que envolvem expressões. Não afeta constraints.
-- Reversão: recriar via CREATE INDEX conforme necessário (salvar plano abaixo, se quiser).

\set ON_ERROR_STOP on

-- (1) Listar grupos duplicados e gerar comandos DROP para os excedentes
WITH idx AS (
  SELECT
    n.nspname                          AS schema_name,
    c.relname                          AS table_name,
    i.relname                          AS index_name,
    am.amname                          AS am_method,
    ix.indisunique                     AS is_unique,
    pg_relation_size(i.oid)            AS index_size,
    pg_get_indexdef(ix.indexrelid)     AS index_def,
    ARRAY_AGG(a.attname ORDER BY k.ord) AS cols
  FROM pg_index ix
  JOIN pg_class i         ON i.oid = ix.indexrelid AND i.relkind = 'i'
  JOIN pg_class c         ON c.oid = ix.indrelid  AND c.relkind = 'r'
  JOIN pg_namespace n     ON n.oid = c.relnamespace
  JOIN pg_am am           ON am.oid = i.relam
  LEFT JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON k.attnum > 0
  LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
  WHERE n.nspname = 'public'
    AND ix.indisvalid
    AND NOT ix.indisprimary
    AND am.amname = 'btree'
    AND NOT (0 = ANY(ix.indkey)) -- exclui índices com expressões
  GROUP BY n.nspname, c.relname, i.relname, am.amname, ix.indisunique, i.oid
),
dup_groups AS (
  SELECT
    schema_name, table_name, is_unique, am_method, cols,
    COUNT(*) AS dup_count,
    ARRAY_AGG(index_name ORDER BY
      (index_name ~* '^idx_fk_') DESC,          -- preferir índices nomeados para FK
      (index_name ~* 'uniq') DESC,               -- depois nomes com 'uniq'
      (index_name ~* 'pkey') DESC,               -- (defensivo) nomes que parecem PK
      LENGTH(index_name),                        -- nomes mais curtos
      index_name                                 -- e por ordem lexicográfica
    ) AS names_ordered
  FROM idx
  GROUP BY schema_name, table_name, is_unique, am_method, cols
  HAVING COUNT(*) > 1
),
keep_and_drop AS (
  SELECT
    schema_name, table_name, is_unique, am_method, cols,
    names_ordered[1]                         AS keep_index,
    names_ordered[2:array_length(names_ordered,1)] AS drop_list
  FROM dup_groups
),
drops AS (
  SELECT
    format('DROP INDEX CONCURRENTLY IF EXISTS %I.%I;', schema_name, idx_name) AS drop_sql
  FROM keep_and_drop,
       LATERAL unnest(drop_list) AS idx_name
)
-- Visualização (opcional): grupos a serem afetados
SELECT
  schema_name AS schema,
  table_name  AS "table",
  is_unique,
  cols        AS columns,
  (SELECT array_agg(x) FROM unnest(drop_list) AS x) AS drop_indexes,
  keep_index
FROM keep_and_drop
ORDER BY schema_name, table_name, is_unique, keep_index;

-- (2) Executar os DROPs (remova o comentário da linha abaixo para efetivar)
-- SELECT drop_sql FROM drops \gexec

-- Dica: rode primeiro sem o \gexec para revisar. Depois, habilite a linha e execute novamente.
