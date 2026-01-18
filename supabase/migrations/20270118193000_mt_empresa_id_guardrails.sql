/*
  MT (multi-tenant) guardrails — empresa_id consistente

  Objetivo:
  - Reduzir risco de "registros órfãos" (empresa_id NULL) em tabelas multi-tenant.
  - Não quebrar dados existentes em PROD (migração segura): constraints NOT VALID.
  - Melhorar determinismo de RLS/RPC e reduzir 403 intermitente por contexto incompleto.

  Estratégia:
  - Para cada tabela em `public` com coluna `empresa_id` *nullable*:
    - Garantir DEFAULT `public.current_empresa_id()` (quando não houver default).
    - Adicionar CHECK constraint `empresa_id is not null` como NOT VALID.

  Importante:
  - Tabelas de observabilidade (ops_*) podem intencionalmente registrar eventos sem empresa ativa;
    portanto são excluídas aqui.
*/

begin;

do $$
declare
  r record;
  v_has_default boolean;
  v_conname text;
begin
  for r in
    select
      c.table_name,
      c.column_default
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name = 'empresa_id'
      and c.is_nullable = 'YES'
      and c.table_name not in (
        -- Observabilidade pode ocorrer antes de resolver empresa ativa
        'ops_403_events',
        'ops_app_errors'
      )
    order by c.table_name
  loop
    v_has_default := r.column_default is not null;

    if not v_has_default then
      execute format(
        'alter table public.%I alter column empresa_id set default public.current_empresa_id()',
        r.table_name
      );
    end if;

    v_conname := case
      when length(r.table_name) <= 40 then format('ck_%s_empresa_id_nn', r.table_name)
      else format('ck_empid_nn_%s', substr(md5(r.table_name), 1, 10))
    end;

    if not exists (
      select 1
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = r.table_name
        and con.conname = v_conname
    ) then
      execute format(
        'alter table public.%I add constraint %I check (empresa_id is not null) not valid',
        r.table_name,
        v_conname
      );
    end if;
  end loop;
end
$$;

commit;
