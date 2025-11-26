-- Query to identify and generate DROP commands for redundant/duplicate indexes
-- Logic:
-- 1. Identify all indexes in 'public' schema.
-- 2. Classify them by keys, opclasses, options, and predicates.
-- 3. Identify "Constraint Indexes" (PK, UNIQUE, EXCLUDE) via pg_constraint.
-- 4. Find EXACT duplicates:
--    - Same table, same definition (keys, expressions, predicate).
--    - Keep: Constraint > Oldest (Lower OID) ? User said: Constraint > Coverage (N/A) > Shortest Name > Lower OID.
-- 5. Find PREFIX redundancies:
--    - Victim is a left-prefix of Keeper.
--    - Victim is NOT unique (unless Keeper is also unique and same keys? No, prefix usually implies victim is subset).
--    - User said: "Prefix redundancy (non-unique index is fully covered by first N columns of another...)"
--    - Victim must NOT be a constraint index.
--    - Keeper must be BTREE, Victim must be BTREE.
--    - Both non-partial (User said: "Never drop... partial indexes").
--    - Tie-breaker logic applies for choosing which to keep if multiple cover each other (rare for prefix, usually one covers other).

WITH index_data AS (
    SELECT
        i.indexrelid,
        c.relname AS index_name,
        t.relname AS table_name,
        i.indisunique,
        i.indisprimary,
        i.indisexclusion,
        i.indimmediate,
        a.amname AS index_type,
        i.indkey,
        -- Convert int2vector to array for easier comparison, but keep order
        string_to_array(textin(int2vectorout(i.indkey)), ' ')::int[] AS key_array,
        -- Opclasses
        i.indclass,
        -- Predicate (partial index)
        pg_get_expr(i.indpred, i.indrelid) AS predicate,
        -- Index definition for exact matching (includes expressions)
        pg_get_indexdef(i.indexrelid) AS index_def,
        -- Check if it supports a constraint
        cons.conname IS NOT NULL AS is_constraint,
        cons.contype,
        c.oid AS index_oid
    FROM
        pg_index i
    JOIN
        pg_class c ON c.oid = i.indexrelid
    JOIN
        pg_class t ON t.oid = i.indrelid
    JOIN
        pg_namespace n ON n.oid = c.relnamespace
    JOIN
        pg_am a ON a.oid = c.relam
    LEFT JOIN
        pg_constraint cons ON cons.conindid = i.indexrelid
    WHERE
        n.nspname = 'public'
        AND a.amname = 'btree' -- Only BTREE as requested
        AND NOT i.indisprimary -- Never drop PK
),
-- Calculate text representations for comparison
index_extended AS (
    SELECT
        *,
        -- Normalized key string for prefix checking (simplification)
        -- We need to handle the fact that indkey contains 0 for expressions, which makes prefix checking hard without parsing.
        -- User requirement: "Redundancies by prefix... both BTREE and non-partial".
        -- We will skip indexes with expressions (0 in indkey) for prefix checks to be safe, unless exact match.
        array_to_string(key_array, ' ') AS key_str,
        pg_get_indexdef(indexrelid) AS full_def
    FROM
        index_data
),
-- Identify Exact Duplicates
exact_duplicates AS (
    SELECT
        a.indexrelid AS victim_oid,
        a.index_name AS victim_name,
        b.indexrelid AS keeper_oid,
        b.index_name AS keeper_name,
        'Exact Duplicate' AS reason
    FROM
        index_extended a
    JOIN
        index_extended b ON a.table_name = b.table_name
            AND a.indexrelid != b.indexrelid
            AND a.index_def = b.index_def -- Exact definition match
            -- Tie-breaker: Keep Constraint > Shortest Name > Lowest OID
            AND (
                (b.is_constraint AND NOT a.is_constraint)
                OR (
                    (a.is_constraint = b.is_constraint)
                    AND (
                        char_length(b.index_name) < char_length(a.index_name)
                        OR (char_length(b.index_name) = char_length(a.index_name) AND b.index_oid < a.index_oid)
                    )
                )
            )
),
-- Identify Prefix Redundancies
prefix_redundancies AS (
    SELECT
        a.indexrelid AS victim_oid,
        a.index_name AS victim_name,
        b.indexrelid AS keeper_oid,
        b.index_name AS keeper_name,
        'Prefix Redundancy' AS reason
    FROM
        index_extended a
    JOIN
        index_extended b ON a.table_name = b.table_name
            AND a.indexrelid != b.indexrelid
    WHERE
        -- Both must be BTREE (filtered in base CTE)
        -- Both must NOT be partial (User: "Never drop... partial")
        a.predicate IS NULL AND b.predicate IS NULL
        -- Victim must NOT be unique (User: "redundancies by prefix (a non-unique index...)")
        AND NOT a.indisunique
        -- Victim must NOT be a constraint
        AND NOT a.is_constraint
        -- Keys check:
        -- 1. No expressions in keys (0 in indkey) for safety in this logic
        AND 0 != ALL(a.key_array)
        AND 0 != ALL(b.key_array)
        -- 2. Victim keys must be a prefix of Keeper keys
        -- We can check if b.key_array starts with a.key_array
        AND array_length(a.key_array, 1) < array_length(b.key_array, 1)
        AND a.key_array = b.key_array[1:array_length(a.key_array, 1)]
        -- 3. Opclasses must match for the prefix
        -- indclass is an oidvector, we can cast to array
        AND string_to_array(textin(oidvectorout(a.indclass)), ' ')::oid[] = 
            (string_to_array(textin(oidvectorout(b.indclass)), ' ')::oid[])[1:array_length(a.key_array, 1)]
),
-- Combine and filter
all_victims AS (
    SELECT * FROM exact_duplicates
    UNION ALL
    SELECT * FROM prefix_redundancies
),
-- Prioritize: If an index is a victim in multiple pairs, pick one reason/keeper.
-- Also ensure we don't create chains where A drops B, and B drops C (though with prefix/exact logic, usually C would be covered by A too).
-- But we should be careful.
unique_victims AS (
    SELECT DISTINCT ON (victim_oid)
        victim_name,
        table_name,
        reason,
        keeper_name
    FROM
        all_victims v
    JOIN index_extended i ON i.indexrelid = v.victim_oid
    ORDER BY
        victim_oid, keeper_name -- deterministic pick
)
SELECT
    format('DROP INDEX CONCURRENTLY IF EXISTS public.%I; -- Reason: %s, Covered by: %s', victim_name, reason, keeper_name) AS drop_command
FROM
    unique_victims
ORDER BY
    table_name, victim_name;
