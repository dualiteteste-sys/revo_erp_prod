/*
  [IDX][FK] Ensure leading indexes for FKs (sem CONCURRENTLY)

  Impacto / Segurança
  - Cria apenas índices btree; não altera dados nem RLS.
  - SECURITY DEFINER + search_path fixo (pg_catalog, public).

  Compatibilidade
  - Idempotente: CREATE INDEX IF NOT EXISTS.
  - Pode ser executado múltiplas vezes; tenta só o que falta.

  Reversibilidade
  - DROP INDEX <nome> se necessário.

  Performance
  - Sem CONCURRENTLY: bloqueia escrita na tabela durante a criação.
  - lock_timeout=2s: se não conseguir lock, pula (tente depois/fora do pico).
*/

create or replace function public.ensure_leading_fk_indexes()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  v_idx_name  text;
  v_cols_list text;
  v_sql       text;
begin
  -- Evita travar: se não conseguir lock rápido, pula a tabela
  perform set_config('lock_timeout','2s', true);
  -- Evita timeout da sessão durante criação de índice
  perform set_config('statement_timeout','0', true);

  -- FKs do schema public sem índice líder (mesmas colunas no início, na ordem)
  for r in
    with fk as (
      select
        n.nspname                                  as schema,
        c.conrelid                                  as relid,
        rel.relname                                 as fk_table,
        c.conname                                   as fk_name,
        c.conkey                                    as fk_attnums,
        array_agg(a.attname order by u.attposition) as fk_cols
      from pg_constraint c
      join pg_class       rel on rel.oid = c.conrelid
      join pg_namespace   n   on n.oid  = rel.relnamespace
      join unnest(c.conkey) with ordinality as u(attnum, attposition) on true
      join pg_attribute   a on a.attrelid = c.conrelid and a.attnum = u.attnum
      where c.contype = 'f'
        and n.nspname = 'public'
      group by n.nspname, c.conrelid, rel.relname, c.conname, c.conkey
    )
    select
      fk.schema,
      fk.relid,
      fk.fk_table,
      fk.fk_name,
      fk.fk_attnums,
      fk.fk_cols
    from fk
    where not exists (
      select 1
      from pg_index i
      where i.indrelid = fk.relid
        and (i.indkey::int2[])[1:cardinality(fk.fk_attnums)] = fk.fk_attnums
    )
  loop
    -- Nome curto + hash (≤63 bytes)
    v_idx_name :=
      'idx_fk_' ||
      left(r.fk_table, 20) || '_' ||
      left(replace(array_to_string(r.fk_cols, '_'), '__', '_'), 24) || '_' ||
      substr(md5(r.fk_table || ':' || array_to_string(r.fk_cols, ',')), 1, 6);

    -- Lista de colunas formatadas
    select string_agg(format('%I', c), ',')
      into v_cols_list
    from unnest(r.fk_cols) as c;

    v_sql := format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s);',
      v_idx_name, r.schema, r.fk_table, v_cols_list
    );

    begin
      execute v_sql;
      raise notice '[IDX][CREATE] % on %.% (%): OK', v_idx_name, r.schema, r.fk_table, v_cols_list;
    exception
      when lock_not_available then
        raise notice '[IDX][SKIP-LOCK] %.% (%): lock indisponível, tente novamente depois', r.schema, r.fk_table, v_cols_list;
    end;
  end loop;
end;
$$;

-- Executa
select public.ensure_leading_fk_indexes();
