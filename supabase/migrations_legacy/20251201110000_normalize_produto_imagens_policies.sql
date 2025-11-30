-- Crie… migração para normalizar as políticas de RLS em public.produto_imagens
-- Mantém RLS por operação e padroniza nomes.

-- 1) Garantir RLS habilitada (idempotente)
alter table public.produto_imagens enable row level security;

-- 2) Remover políticas antigas/duplicadas por nome conhecido (idempotente)
drop policy if exists "Usuários podem deletar imagens de suas empresas" on public.produto_imagens;
drop policy if exists "Usuários podem inserir imagens em suas empresas" on public.produto_imagens;
drop policy if exists "Usuários podem ver imagens de suas empresas"     on public.produto_imagens;
drop policy if exists "Usuários podem atualizar imagens de suas empresas" on public.produto_imagens;

drop policy if exists pi_insert_same_company  on public.produto_imagens;
drop policy if exists pi_select_same_company  on public.produto_imagens;
drop policy if exists pi_update_same_company  on public.produto_imagens;

drop policy if exists produto_imagens_sel on public.produto_imagens;
drop policy if exists produto_imagens_ins on public.produto_imagens;
drop policy if exists produto_imagens_upd on public.produto_imagens;
drop policy if exists produto_imagens_del on public.produto_imagens;

-- 3) Criar políticas padronizadas (uma por operação)
create policy produto_imagens_sel
on public.produto_imagens
for select
using ( public.is_user_member_of(empresa_id) );

create policy produto_imagens_ins
on public.produto_imagens
for insert
with check ( public.is_user_member_of(empresa_id) );

create policy produto_imagens_upd
on public.produto_imagens
for update
using ( public.is_user_member_of(empresa_id) )
with check ( public.is_user_member_of(empresa_id) );

create policy produto_imagens_del
on public.produto_imagens
for delete
using ( public.is_user_member_of(empresa_id) );
