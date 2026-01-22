-- Purge completo (dados + storage + auth quando aplicável) para tenant de testes.
-- Regras:
-- - Sempre via migration (para sincronizar PROD/DEV e preservar rastreabilidade).
-- - Função `public.ops_purge_empresas(uuid[])` é definida em `20270121163000_ops_purge_test_tenants_prod.sql`.

do $$
begin
  if to_regprocedure('public.ops_purge_empresas(uuid[])') is null then
    raise exception 'Função public.ops_purge_empresas(uuid[]) não encontrada; aplique as migrations base antes desta.';
  end if;

  perform public.ops_purge_empresas(array['0458d5bf-d7de-4c95-87f3-3fce12a726fd'::uuid]);
end
$$;

notify pgrst, 'reload schema';
