-- [CREATE_INDEX][PASSO_3] FKs sem índice-líder (comparação por NOME)
-- Impacto: apenas CREATE INDEX btree; RLS inalterada.
-- Observação: sem CONCURRENTLY (DO roda em transação).

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
        con.conkey   as fk_attnums
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
    idx_keys as (
      -- colunas de chave dos índices (exclui INCLUDE)
      select
        i.indrelid,
        i.indexrelid,
        array_agg(a.attname order by s.n) as index_key_cols
      from pg_index i
      join unnest(i.indkey::int2[]) with ordinality as s(attnum, n) on true
      left join pg_attribute a
        on a.attrelid = i.indrelid
       and a.attnum   = s.attnum
      where i.indisvalid
        and i.indisready
        and s.n <= i.indnkeyatts
      group by i.indrelid, i.indexrelid
    ),
    missing as (
      select
        c.schema,
        c.fk_table,
        c.fk_name,
        c.fk_relid,
        c.fk_columns,
        array_to_string(c.fk_columns_quoted, ', ') as cols_sql,
        format(
          'idx_%s_%s_%s',
          c.fk_table,
          array_to_string(c.fk_columns, '_'),
          substr(md5(c.fk_relid::text || '_' || array_to_string(c.fk_columns, '_')), 1, 6)
        ) as suggested_index_name
      from cols c
      where not exists (
        select 1
        from idx_keys k
        where k.indrelid = c.fk_relid
          and (k.index_key_cols)[1:array_length(c.fk_columns,1)] = c.fk_columns
      )
    )
    select * from missing
  loop
    execute format(
      'create index if not exists %I on %I.%I using btree (%s);',
      r.suggested_index_name, r.schema, r.fk_table, r.cols_sql
    );
    raise notice '[CREATE_INDEX][OK] % on %.%', r.suggested_index_name, r.schema, r.fk_table;
  end loop;
end
$$ language plpgsql;
