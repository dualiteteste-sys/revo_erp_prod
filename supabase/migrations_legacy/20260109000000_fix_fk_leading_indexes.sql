/*
  # [PERF][FK IDX] Cria índices líderes de FK ausentes (schema public)

  Impacto / Segurança
  - Melhora performance em JOIN/DELETE/UPDATE por FK.
  - Apenas lê catálogo e cria índices BTREE não-únicos.
  - Não altera RLS, dados ou permissões.

  Compatibilidade
  - Age somente em schema public.
  - Idempotente: só cria se não houver índice cujo prefixo = colunas da FK.

  Reversibilidade
  - DROP INDEX <nome>;

  Performance
  - CREATE INDEX sem CONCURRENTLY (execução em DO/tx). Pode bloquear brevemente escrita na tabela.
*/

set local search_path = pg_catalog, public;

do $$
declare
  r record;
  v_cols_csv text;
  v_cols_snake text;
  v_idx_name text;
begin
  /*
    Seleciona FKs do schema public cujo(s) campo(s) líder(es) não são prefixo de nenhum índice na tabela "filha".
    Compara por posição via indkey (int2vector) x conkey (int2[]).
  */
  for r in
    with fks as (
      select
        n.nspname                               as schema,
        rel.relname                             as fk_table,
        con.conname                             as fk_name,
        con.conrelid                            as fk_relid,
        con.conkey                              as fk_attnums -- int2[]
      from pg_constraint con
      join pg_class rel   on rel.oid = con.conrelid
      join pg_namespace n on n.oid   = rel.relnamespace
      where con.contype = 'f'
        and n.nspname = 'public'
    ),
    missing as (
      select f.*
      from fks f
      where not exists (
        select 1
        from pg_index i
        where i.indrelid = f.fk_relid
          and (i.indkey::int2[])[1:cardinality(f.fk_attnums)] = f.fk_attnums
      )
    )
    select *
    from missing
    order by fk_table, fk_name
  loop
    -- Monta lista de colunas (CSV para o SQL e snake para o nome do índice)
    select
      string_agg(quote_ident(a.attname), ', ' order by u.ord),
      string_agg(a.attname, '_' order by u.ord)
    into v_cols_csv, v_cols_snake
    from unnest(r.fk_attnums) with ordinality as u(attnum, ord)
    join pg_attribute a
      on a.attrelid = r.fk_relid
     and a.attnum   = u.attnum;

    -- Nome do índice: idx_<tabela>_<col1>[_col2...], truncado a 63 chars
    v_idx_name := substr(format('idx_%s_%s', r.fk_table, v_cols_snake), 1, 63);

    -- Garante novamente (por catálogo) que não exista índice cujo prefixo = colunas da FK
    if not exists (
      select 1
      from pg_index i
      where i.indrelid = r.fk_relid
        and (i.indkey::int2[])[1:cardinality(r.fk_attnums)] = r.fk_attnums
    ) then
      execute format(
        'create index %I on %I.%I using btree (%s);',
        v_idx_name, r.schema, r.fk_table, v_cols_csv
      );
      raise notice 'Created % on %.% (%).', v_idx_name, r.schema, r.fk_table, v_cols_csv;
    end if;
  end loop;
end
$$ language plpgsql;
