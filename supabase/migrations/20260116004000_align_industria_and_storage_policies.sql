-- Alinhamento rápido de PROD vs schema esperado (VERIFY) para itens críticos.
-- Objetivo: evitar drift recorrente em policies/views que causam erros em produção.

begin;

-- -------------------------------------------------------------------
-- View de compatibilidade: industria_roteiro_etapas
-- -------------------------------------------------------------------
do $$
begin
  if to_regclass('public.industria_roteiros_etapas') is null then
    raise notice 'Tabela public.industria_roteiros_etapas não existe; pulando view industria_roteiro_etapas.';
  else
    execute $v$
      create or replace view public.industria_roteiro_etapas as
      select * from public.industria_roteiros_etapas;
    $v$;

    execute $c$
      comment on view public.industria_roteiro_etapas
        is 'Compat layer: mirror of industria_roteiros_etapas para funções legadas.';
    $c$;
  end if;
end $$;

-- -------------------------------------------------------------------
-- Policies esperadas: industria_roteiros / produto_imagens
-- -------------------------------------------------------------------
do $$
declare
  v_exists boolean;
begin
  -- industria_roteiros
  if to_regclass('public.industria_roteiros') is not null then
    execute 'alter table public.industria_roteiros enable row level security';

    select exists(
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'industria_roteiros'
        and policyname = 'Enable all access'
    ) into v_exists;

    if v_exists then
      execute $p$
        alter policy "Enable all access"
        on public.industria_roteiros
        to public
        using (empresa_id = current_empresa_id())
      $p$;
    else
      execute $p$
        create policy "Enable all access"
        on public.industria_roteiros
        for all
        to public
        using (empresa_id = current_empresa_id())
      $p$;
    end if;
  else
    raise notice 'Tabela public.industria_roteiros não existe; pulando policy.';
  end if;

  -- produto_imagens
  if to_regclass('public.produto_imagens') is not null then
    execute 'alter table public.produto_imagens enable row level security';

    select exists(
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'produto_imagens'
        and policyname = 'Enable all access'
    ) into v_exists;

    if v_exists then
      execute $p$
        alter policy "Enable all access"
        on public.produto_imagens
        to public
        using (empresa_id = current_empresa_id())
      $p$;
    else
      execute $p$
        create policy "Enable all access"
        on public.produto_imagens
        for all
        to public
        using (empresa_id = current_empresa_id())
      $p$;
    end if;
  else
    raise notice 'Tabela public.produto_imagens não existe; pulando policy.';
  end if;
end $$;

commit;

