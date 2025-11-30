/*
  # Patch – estoque_movimentos (compatibilizar com beneficiamento por NF-e)

  ## O que faz
  - Garante colunas essenciais: data_movimento, origem_tipo, origem_id, tipo_mov.
  - Cria índice (empresa_id, produto_id, data_movimento) se não existir.
  - Cria unique constraint de idempotência (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov) apenas se todas as colunas existirem.
  - Garante trigger updated_at e RLS/policies.

  ## Impacto
  - Segurança: mantém RLS por empresa_id.
  - Compatibilidade: não remove colunas/constraints; apenas adiciona.
  - Reversibilidade: tudo pode ser removido em migração futura.
*/

-- 1) Colunas necessárias (podem não existir em ambientes legados)

-- data_movimento: usada pelos módulos de beneficiamento/estoque
alter table public.estoque_movimentos
  add column if not exists data_movimento date not null default current_date;

-- origem_tipo: texto indicando a origem do movimento (ex: 'nfe_beneficiamento')
alter table public.estoque_movimentos
  add column if not exists origem_tipo text;

-- origem_id: UUID da origem (ex: fiscal_nfe_imports.id)
alter table public.estoque_movimentos
  add column if not exists origem_id uuid;

-- tipo_mov: tipo do movimento (ex: 'entrada_beneficiamento')
alter table public.estoque_movimentos
  add column if not exists tipo_mov text;

-- 2) Índice por empresa/produto/data (suporta consultas temporais de estoque)
create index if not exists idx_est_mov_emp_prod_data
  on public.estoque_movimentos (empresa_id, produto_id, data_movimento);

-- 3) Unique de idempotência (evita duplicação por origem)
do $$
begin
  -- Só cria a constraint se TODAS as colunas existirem
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'estoque_movimentos'
      and column_name  in ('empresa_id','origem_tipo','origem_id','produto_id','tipo_mov')
    group by table_schema, table_name
    having count(*) = 5
  )
  then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'est_mov_emp_origem_uk'
        and conrelid = 'public.estoque_movimentos'::regclass
    ) then
      alter table public.estoque_movimentos
        add constraint est_mov_emp_origem_uk
        unique (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov);
    end if;
  end if;
end;
$$;

-- 4) Trigger updated_at (se ausente)
do $$
begin
  if not exists (
    select 1
    from pg_trigger
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

-- 5) RLS e policies (garantir que estão ativas e corretas)
alter table public.estoque_movimentos enable row level security;

drop policy if exists "est_mov_select" on public.estoque_movimentos;
drop policy if exists "est_mov_insert" on public.estoque_movimentos;
drop policy if exists "est_mov_update" on public.estoque_movimentos;
drop policy if exists "est_mov_delete" on public.estoque_movimentos;

create policy "est_mov_select"
  on public.estoque_movimentos
  for select
  using (empresa_id = public.current_empresa_id());

create policy "est_mov_insert"
  on public.estoque_movimentos
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "est_mov_update"
  on public.estoque_movimentos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "est_mov_delete"
  on public.estoque_movimentos
  for delete
  using (empresa_id = public.current_empresa_id());
