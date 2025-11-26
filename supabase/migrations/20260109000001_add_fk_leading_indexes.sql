/*
  # [CREATE_INDEX] Índices líderes para Foreign Keys (schema public)

  Impacto / Segurança
  - Somente CREATE INDEX; nenhum dado alterado. RLS inalterada.
  - Reduz custo de validação de FKs e melhora JOINs/DELETE/UPDATE.

  Compatibilidade
  - Sem breaking changes; nomes determinísticos.

  Reversibilidade
  - ÍNDICES criados têm prefixo `idx_` (vide RAISE NOTICE).
  - Rollback manual: `DROP INDEX IF EXISTS <nome_do_indice>;`

  Performance
  - Build de índices pode usar locks breves. Execute em janela baixa.
*/

set local search_path = pg_catalog, public;

do $$
declare r record;
begin
  for r in
    with fks as (
      select
        n.nspname    as schema,
        rel.relname  as fk_table,
        con.conname  as fk_name,
        con.conrelid as fk_relid,
        con.conkey   as fk_attnums -- int2[]
      from pg_constraint con
      join pg_class rel   on rel.oid = con.conrelid
      join pg_namespace n on n.oid   = rel.relnamespace
      where con.contype = 'f'
        and n.nspname = 'public'
    ),
    cols as (
      select
        f.*,
        array_agg(a.attname order by u.ord)               as fk_columns,
        array_agg(quote_ident(a.attname) order by u.ord)  as fk_columns_quoted
      from fks f
      join unnest(f.fk_attnums) with ordinality as u(attnum, ord) on true
      join pg_attribute a
        on a.attrelid = f.fk_relid
       and a.attnum   = u.attnum
      group by f.schema, f.fk_table, f.fk_name, f.fk_relid, f.fk_attnums
    ),
    check_cover as (
      select
        c.*,
        exists (
          select 1
          from pg_index ix
          where ix.indrelid = c.fk_relid
            and (ix.indkey::int2[])[1:cardinality(c.fk_attnums)] = c.fk_attnums
        ) as has_cover
      from cols c
    ),
    missing as (
      select
        m.schema,
        m.fk_table,
        array_to_string(m.fk_columns_quoted, ', ') as cols_sql,
        format(
          'idx_%s_%s_%s',
          m.fk_table,
          array_to_string(m.fk_columns, '_'),
          substr(md5(m.fk_relid::text || '_' || array_to_string(m.fk_attnums, '_')), 1, 6)
        ) as suggested_index_name
      from check_cover m
      where m.has_cover = false
    )
    select * from missing
  loop
    execute format(
      'create index if not exists %I on %I.%I using btree (%s);',
      r.suggested_index_name, r.schema, r.fk_table, r.cols_sql
    );
    raise notice '[CREATE_INDEX] %', r.suggested_index_name;
  end loop;
end
$$ language plpgsql;

-- Pós-execução (verificação rápida): deve retornar zero linhas "MISSING_LEADING_INDEX"
with fks as (
  select n.nspname as schema, rel.relname as fk_table, con.conname as fk_name,
         con.conrelid as fk_relid, con.conkey as fk_attnums
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where con.contype = 'f' and n.nspname = 'public'
),
cols as (
  select f.*, array_agg(a.attname order by u.ord) as fk_columns
  from fks f
  join unnest(f.fk_attnums) with ordinality as u(attnum, ord) on true
  join pg_attribute a on a.attrelid = f.fk_relid and a.attnum = u.attnum
  group by f.schema, f.fk_table, f.fk_name, f.fk_relid, f.fk_attnums
)
select c.schema, c.fk_table, c.fk_name, c.fk_columns::text as fk_columns, 'MISSING_LEADING_INDEX' as status
from cols c
where not exists (
  select 1
  from pg_index ix
  where ix.indrelid = c.fk_relid
    and (ix.indkey::int2[])[1:cardinality(c.fk_attnums)] = c.fk_attnums
);
