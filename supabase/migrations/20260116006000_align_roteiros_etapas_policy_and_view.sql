-- Alinha objetos críticos usados por Indústria/QA:
-- - Policy "Enable all access" em `public.industria_roteiros_etapas`
-- - View de compatibilidade `public.industria_roteiro_etapas` (md5 estável)

begin;

-- Policy esperada no baseline/VERIFY
do $$
begin
  if to_regclass('public.industria_roteiros_etapas') is null then
    raise notice 'Tabela public.industria_roteiros_etapas não existe; pulando policy/view.';
    return;
  end if;

  execute 'alter table public.industria_roteiros_etapas enable row level security';

  -- Recria de forma determinística (evita drift de roles/comando/expr)
  execute 'drop policy if exists "Enable all access" on public.industria_roteiros_etapas';
  execute $p$
    create policy "Enable all access"
    on public.industria_roteiros_etapas
    for all
    to public
    using (empresa_id = current_empresa_id())
  $p$;
end $$;

-- View de compatibilidade (usa schema qualificado para md5 estável)
drop view if exists public.industria_roteiro_etapas;
create view public.industria_roteiro_etapas as
select *
  from public.industria_roteiros_etapas;

comment on view public.industria_roteiro_etapas
  is 'Compat layer: mirror of industria_roteiros_etapas para funções legadas.';

commit;

