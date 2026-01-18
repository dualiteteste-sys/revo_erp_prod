/*
  MT guardrails — validar constraints empresa_id NN (quando seguro)

  Por padrão criamos CHECK (empresa_id is not null) como NOT VALID para não quebrar PROD.
  Nesta migração, validamos essas constraints *somente* quando não existem registros órfãos.

  Benefícios:
  - Garante enforcement real (planner + validação) no schema.
  - Aumenta a confiabilidade e reduz regressões que viram 403/400 intermitentes.

  Observação:
  - Se existir empresa_id NULL em alguma tabela, mantemos a constraint como NOT VALID
    e registramos uma NOTICE (sem quebrar deploy). A correção de dados deve ser feita
    com um backfill específico por domínio/tabela, para evitar atribuições incorretas.
*/

begin;

do $$
declare
  r record;
  v_nulls bigint;
begin
  for r in
    select
      n.nspname as schema_name,
      rel.relname as table_name,
      con.conname as constraint_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and con.contype = 'c'
      and (
        con.conname ~ '^ck_.*_empresa_id_nn$'
        or con.conname ~ '^ck_empid_nn_.*$'
      )
      and rel.relname not in (
        'ops_403_events',
        'ops_app_errors',
        -- Catálogos globais (defaults do sistema)
        'unidades_medida',
        'embalagens'
      )
    order by rel.relname
  loop
    execute format('select count(*) from public.%I where empresa_id is null', r.table_name) into v_nulls;

    if v_nulls = 0 then
      execute format('alter table public.%I validate constraint %I', r.table_name, r.constraint_name);
    else
      raise notice 'MT: tabela %.% tem % registros com empresa_id NULL; mantendo % como NOT VALID (necessita backfill específico).',
        r.schema_name, r.table_name, v_nulls, r.constraint_name;
    end if;
  end loop;
end
$$;

commit;
