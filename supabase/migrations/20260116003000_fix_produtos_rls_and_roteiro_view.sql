-- Alinhamento de schema PROD vs VERIFY:
-- - Garante view de compatibilidade `industria_roteiro_etapas`
-- - Garante policies de RLS esperadas em `public.produtos`

begin;

-- -------------------------------------------------------------------
-- Compat: alias industria_roteiro_etapas -> industria_roteiros_etapas
-- -------------------------------------------------------------------
do $$
begin
  if to_regclass('public.industria_roteiros_etapas') is null then
    raise exception 'Tabela public.industria_roteiros_etapas não existe; não é possível criar view public.industria_roteiro_etapas.';
  end if;

  execute $v$
    create or replace view public.industria_roteiro_etapas as
    select * from public.industria_roteiros_etapas;
  $v$;

  execute $c$
    comment on view public.industria_roteiro_etapas
      is 'Compat layer: mirror of industria_roteiros_etapas para funções legadas.';
  $c$;
end $$;

-- -------------------------------------------------------------------
-- RLS: produtos (policies esperadas pelo baseline/VERIFY)
-- -------------------------------------------------------------------
do $$
begin
  -- Ativa RLS (idempotente)
  execute 'alter table public.produtos enable row level security';

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'produtos'
       and policyname = 'Enable read access for all users'
  ) then
    execute $p$
      create policy "Enable read access for all users"
      on public.produtos
      for select
      to public
      using (empresa_id = current_empresa_id())
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'produtos'
       and policyname = 'Enable insert for authenticated users only'
  ) then
    execute $p$
      create policy "Enable insert for authenticated users only"
      on public.produtos
      for insert
      to public
      with check (empresa_id = current_empresa_id())
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'produtos'
       and policyname = 'Enable update for authenticated users only'
  ) then
    execute $p$
      create policy "Enable update for authenticated users only"
      on public.produtos
      for update
      to public
      using (empresa_id = current_empresa_id())
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'produtos'
       and policyname = 'Enable delete for authenticated users only'
  ) then
    execute $p$
      create policy "Enable delete for authenticated users only"
      on public.produtos
      for delete
      to public
      using (empresa_id = current_empresa_id())
    $p$;
  end if;
end $$;

commit;

