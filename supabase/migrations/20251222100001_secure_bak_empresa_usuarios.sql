-- [SECURITY] RLS + deny-all em public._bak_empresa_usuarios
-- Impacto: remove erro do linter; impede acesso via PostgREST; funções SD/service_role continuam operando.
-- Reversível: drop policy + disable RLS.

-- 1) Verificar existência
do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = '_bak_empresa_usuarios' and c.relkind = 'r'
  ) then
    raise notice 'Tabela public._bak_empresa_usuarios não encontrada; nada a fazer.';
    return;
  end if;

  -- 2) Habilitar RLS (idempotente)
  execute 'alter table public._bak_empresa_usuarios enable row level security';

  -- 3) Remover policy antiga, se existir, e criar deny-all
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = '_bak_empresa_usuarios'
      and policyname = 'deny_all_on_bak_empresa_usuarios'
  ) then
    execute 'drop policy deny_all_on_bak_empresa_usuarios on public._bak_empresa_usuarios';
  end if;

  execute $p$
    create policy deny_all_on_bak_empresa_usuarios
    on public._bak_empresa_usuarios
    for all
    to authenticated, anon
    using (false)
    with check (false)
  $p$;

  -- 4) Reforço: retirar privilégios diretos de leitura/escrita de roles públicas (defesa em profundidade)
  revoke all on table public._bak_empresa_usuarios from public, authenticated, anon;

end
$$;

-- 5) Reload do schema no PostgREST (efeito imediato)
select pg_notify('pgrst','reload schema');
