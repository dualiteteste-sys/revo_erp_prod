-- [IDX][FK] Ensure leading indexes for FKs via pg_background (idempotente)
-- Impacto / Segurança
-- - Apenas criação de índices (btree); não altera dados nem RLS.
-- - SECURITY DEFINER + search_path fixo.
-- Compatibilidade
-- - Somente adiciona índices; seguro para leitura/escrita.
-- Reversibilidade
-- - DROP INDEX CONCURRENTLY por nome, se necessário.
-- Performance
-- - CONCURRENTLY evita long blocking em escrita; aguarda término por FK.

create extension if not exists pg_background;

create or replace function public.ensure_leading_fk_indexes()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  v_idx_name text;
  v_cols_list text;
  v_sql text;
  v_pid int;
begin
  -- Varre todas as FKs do schema public e encontra as que NÃO têm índice líder correspondente
  for r in
    with fk as (
      select
        n.nspname        as schema,
        c.conrelid       as relid,
        rel.relname      as fk_table,
        c.conname        as fk_name,
        c.conkey         as fk_attnums,
        array_agg(a.attname order by u.attposition) as fk_cols
      from pg_constraint c
      join pg_class rel      on rel.oid = c.conrelid
      join pg_namespace n    on n.oid  = rel.relnamespace
      join unnest(c.conkey) with ordinality as u(attnum, attposition) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = u.attnum
      where c.contype = 'f'
        and n.nspname = 'public'
      group by n.nspname, c.conrelid, rel.relname, c.conname, c.conkey
    )
    select
      fk.schema,
      fk.relid,
      fk.fk_table,
      fk.fk_name,
      fk.fk_cols
    from fk
    where not exists (
      select 1
      from pg_index i
      where i.indrelid = fk.relid
        -- Índice existente iniciando exatamente pelas colunas da FK (em ordem)
        and (i.indkey::int2[])[1:cardinality(fk.fk_attnums)] = fk.fk_attnums
    )
  loop
    -- Nome do índice: curto + hash para respeitar limite de 63 bytes
    v_idx_name :=
      'idx_fk_' ||
      left(r.fk_table, 20) || '_' ||
      left(replace(array_to_string(r.fk_cols, '_'), '__', '_'), 24) || '_' ||
      substr(md5(r.fk_table || ':' || array_to_string(r.fk_cols, ',')), 1, 6);

    -- Lista de colunas formatadas de forma segura
    select string_agg(format('%I', col), ',')
      into v_cols_list
    from unnest(r.fk_cols) as col;

    v_sql := format(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS %I ON %I.%I (%s);',
      v_idx_name, r.schema, r.fk_table, v_cols_list
    );

    -- Executa fora da transação da migration
    select pg_background_launch(v_sql) into v_pid;

    -- Aguarda término e captura resultado (evita "sair" antes do fim)
    perform pg_background_result(v_pid);

    raise notice '[IDX][CREATE] % on %.% (%): OK',
      v_idx_name, r.schema, r.fk_table, v_cols_list;
  end loop;
end;
$$;

-- Executa a rotina
select public.ensure_leading_fk_indexes();
