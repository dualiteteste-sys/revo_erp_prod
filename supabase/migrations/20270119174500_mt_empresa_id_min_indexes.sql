/*
  MT: Índices mínimos por empresa_id (performance/escala)

  Objetivo:
  - Para todas as tabelas `public` que possuem coluna `empresa_id`, criar (se ausente)
    um índice simples começando por `empresa_id`.
  - Melhora paginação/filtros tenant-safe e reduz risco de "scan" com dados grandes.

  Observação:
  - `create index if not exists` é idempotente.
  - Nome do índice usa hash para evitar exceder 63 chars.
*/

begin;

do $$
declare
  r record;
  v_idx_name text;
  v_has_idx boolean;
begin
  for r in
    select
      c.oid as relid,
      n.nspname as schema_name,
      c.relname as table_name,
      a.attnum as empresa_attnum
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    -- Já existe índice com a primeira coluna = empresa_id?
    select exists (
      select 1
      from pg_index i
      where i.indrelid = r.relid
        and i.indisvalid
        and i.indnatts >= 1
        and (i.indkey[0] = r.empresa_attnum)
    )
    into v_has_idx;

    if v_has_idx then
      continue;
    end if;

    v_idx_name := format(
      'idx_%s_empresa_id_%s',
      r.table_name,
      substr(md5(r.table_name), 1, 8)
    );

    execute format(
      'create index if not exists %I on %I.%I (empresa_id)',
      v_idx_name,
      r.schema_name,
      r.table_name
    );
  end loop;
end;
$$;

commit;

