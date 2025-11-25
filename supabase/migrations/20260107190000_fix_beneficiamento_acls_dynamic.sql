-- =========================================================
-- Patch ACLs RPCs Beneficiamento (sem assumir assinaturas)
-- - REVOKE/GRANT dinâmicos para todas as sobrecargas
-- - Evita erro "function ... does not exist"
-- =========================================================
set search_path = pg_catalog, public;

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname  as schema_name,
      p.proname  as func_name,
      p.oid      as func_oid,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'industria_benef_list_ordens',
        'industria_benef_update_status',
        'industria_benef_manage_componente',
        'industria_benef_manage_entrega'
      )
  loop
    -- Limpa ACLs anteriores (se existirem)
    execute format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, authenticated, service_role',
      r.schema_name, r.func_name, r.args
    );

    -- Concede EXECUTE para roles de API
    execute format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
      r.schema_name, r.func_name, r.args
    );
  end loop;
end $$;

-- Atualiza cache do PostgREST
notify pgrst, 'reload schema';
