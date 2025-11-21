-- [SECURITY] Normaliza o search_path de todas as funções do schema public
-- para o padrão seguro 'pg_catalog, public', evitando function hijacking.

do $$
declare
  r record;
  v_current text;
begin
  for r in
    select
      n.nspname                         as schema_name,
      p.proname                         as func_name,
      p.oid                             as func_oid,
      pg_get_function_identity_arguments(p.oid) as func_args,
      coalesce(
        (select string_agg(setting, ',')
           from unnest(coalesce(p.proconfig, array[]::text[])) conf(setting)
           where setting ilike 'search_path=%'),
        ''
      ) as sp
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    v_current := r.sp;

    -- Se já estiver exatamente no padrão, pule
    if v_current = 'search_path=pg_catalog, public' then
      continue;
    end if;

    -- Ajuste para o padrão seguro
    execute format(
      'alter function %I.%I(%s) set search_path = pg_catalog, public',
      r.schema_name, r.func_name, r.func_args
    );
  end loop;
end
$$ language plpgsql;
