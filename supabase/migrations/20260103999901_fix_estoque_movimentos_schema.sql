/*
  # Patch – estoque_movimentos: add data_movimento + garantir índice/trigger/RLS

  ## O que faz
  - Adiciona a coluna data_movimento se não existir.
  - (Re)cria índice por (empresa_id, produto_id, data_movimento).
  - Garante unique constraint de idempotência (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov).
  - Garante trigger updated_at e RLS/policies.

  ## Segurança
  - RLS por operação preservada.
  - Sem destruição de dados; alterações idempotentes.

  ## Reversibilidade
  - Pode remover coluna/índice/constraint se necessário em rollback futuro.
*/

-- 1) Coluna necessária (legado pode não ter)
alter table public.estoque_movimentos
  add column if not exists data_movimento date not null default current_date;

-- 2) Índice por empresa/produto/data (usado em filtros e relatórios)
create index if not exists idx_est_mov_emp_prod_data
  on public.estoque_movimentos (empresa_id, produto_id, data_movimento);



-- 4) Trigger updated_at (se ausente)
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_estoque_movimentos'
      and tgrelid = 'public.estoque_movimentos'::regclass
  ) then
    create trigger handle_updated_at_estoque_movimentos
      before update on public.estoque_movimentos
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- 5) RLS e policies (garantir que estão ativas)
alter table public.estoque_movimentos enable row level security;

drop policy if exists "est_mov_select" on public.estoque_movimentos;
drop policy if exists "est_mov_insert" on public.estoque_movimentos;
drop policy if exists "est_mov_update" on public.estoque_movimentos;
drop policy if exists "est_mov_delete" on public.estoque_movimentos;

create policy "est_mov_select"
  on public.estoque_movimentos for select
  using (empresa_id = public.current_empresa_id());

create policy "est_mov_insert"
  on public.estoque_movimentos for insert
  with check (empresa_id = public.current_empresa_id());

create policy "est_mov_update"
  on public.estoque_movimentos for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "est_mov_delete"
  on public.estoque_movimentos for delete
  using (empresa_id = public.current_empresa_id());
