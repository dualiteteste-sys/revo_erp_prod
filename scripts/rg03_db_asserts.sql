-- RG-03: asserts de banco para evitar regressões que viram erros no console
-- (ex.: RPC ambígua, grants faltando em JOIN/embeds, colunas inexistentes)

\set ON_ERROR_STOP on

do $$
begin
  -- 1) Evita PostgREST HTTP_300 por overload ambíguo
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'compras_list_pedidos'
      and p.pronargs = 2
  ) then
    raise exception 'RG-03: overload de public.compras_list_pedidos com 2 args ainda existe (causa HTTP_300).';
  end if;

  -- 2) View `empresa_features` deve conter campos usados pelo app (evita 400/403)
  if not exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'empresa_features') then
    raise exception 'RG-03: view public.empresa_features não existe.';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='empresa_features' and column_name='plano_mvp') then
    raise exception 'RG-03: view public.empresa_features sem coluna plano_mvp.';
  end if;

  -- 3) `fiscal_nfe_emissoes.updated_at` é usado em ordenação; precisa existir
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fiscal_nfe_emissoes' and column_name='updated_at') then
    raise exception 'RG-03: tabela public.fiscal_nfe_emissoes sem coluna updated_at.';
  end if;

  -- 4) Grants mínimos que evitam 403 em embeds/relatórios no app
  if not has_table_privilege('authenticated', 'public.fiscal_nfe_imports', 'select') then
    raise exception 'RG-03: role authenticated sem SELECT em public.fiscal_nfe_imports (causa 403 em recebimentos).';
  end if;

  if not has_table_privilege('authenticated', 'public.pessoas', 'select') then
    raise exception 'RG-03: role authenticated sem SELECT em public.pessoas (causa 403 em parceiros/RPCs).';
  end if;
end $$;

