-- [SECURITY] Cria a tabela e as políticas de segurança para Linhas de Produto

-- 1) Cria a tabela `produto_linhas`
create table if not exists public.produto_linhas (
    id uuid default gen_random_uuid() primary key,
    empresa_id uuid not null references public.empresas(id) on delete cascade,
    nome text not null,
    status text not null default 'ativo', -- 'ativo' ou 'inativo'
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

-- 2) Habilita RLS
alter table public.produto_linhas enable row level security;

-- 3) Limpa policies antigas (idempotente)
drop policy if exists "pl_select_same_company" on public.produto_linhas;
drop policy if exists "pl_insert_same_company" on public.produto_linhas;
drop policy if exists "pl_update_same_company" on public.produto_linhas;
drop policy if exists "pl_delete_same_company" on public.produto_linhas;

-- 4) Cria as policies de RLS
create policy "pl_select_same_company"
  on public.produto_linhas for select
  using (public.is_user_member_of(empresa_id));

create policy "pl_insert_same_company"
  on public.produto_linhas for insert
  with check (public.is_user_member_of(empresa_id));

create policy "pl_update_same_company"
  on public.produto_linhas for update
  using (public.is_user_member_of(empresa_id))
  with check (public.is_user_member_of(empresa_id));
  
create policy "pl_delete_same_company"
  on public.produto_linhas for delete
  using (public.is_user_member_of(empresa_id));

-- 5) Garante que o trigger de `updated_at` exista e seja aplicado
create trigger handle_updated_at
  before update on public.produto_linhas
  for each row
  execute procedure moddatetime (updated_at);
