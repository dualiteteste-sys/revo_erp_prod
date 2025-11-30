-- [MIGRATION] Núcleo de Parceiros: pessoas, pessoa_enderecos, pessoa_contatos
-- Padrões do projeto: UUID, ON DELETE CASCADE, trigger updated_at, RLS por operação, search_path seguro em funções.

-- 0) Enum de tipo de pessoa
do $$
begin
    if not exists (select 1 from pg_type where typname = 'pessoa_tipo') then
        create type public.pessoa_tipo as enum ('cliente', 'fornecedor', 'ambos');
    end if;
end$$;


-- 1) Tabela pessoas
create table if not exists public.pessoas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  tipo                public.pessoa_tipo not null,
  nome                text not null,
  doc_unico           text,            -- CPF/CNPJ ou equivalente
  email               text,
  telefone            text,
  inscr_estadual      text,
  isento_ie           boolean default false,
  inscr_municipal     text,
  observacoes         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 1.1) Índices essenciais
create index if not exists idx_pessoas_empresa_tipo on public.pessoas (empresa_id, tipo);
create index if not exists idx_pessoas_nome_trgm on public.pessoas using gin (nome gin_trgm_ops);
create unique index if not exists ux_pessoas_empresa_doc on public.pessoas (empresa_id, doc_unico) where doc_unico is not null;

-- 1.2) Trigger updated_at
drop trigger if exists tg_pessoas_updated_at on public.pessoas;
create trigger tg_pessoas_updated_at
before update on public.pessoas
for each row execute function public.tg_set_updated_at();

-- 1.3) RLS
alter table public.pessoas enable row level security;

drop policy if exists pessoas_sel on public.pessoas;
drop policy if exists pessoas_ins on public.pessoas;
drop policy if exists pessoas_upd on public.pessoas;
drop policy if exists pessoas_del on public.pessoas;

create policy pessoas_sel
on public.pessoas
for select
using ( public.is_user_member_of(empresa_id) );

create policy pessoas_ins
on public.pessoas
for insert
with check ( public.is_user_member_of(empresa_id) );

create policy pessoas_upd
on public.pessoas
for update
using ( public.is_user_member_of(empresa_id) )
with check ( public.is_user_member_of(empresa_id) );

create policy pessoas_del
on public.pessoas
for delete
using ( public.is_user_member_of(empresa_id) );

-- 2) Tabela pessoa_enderecos
create table if not exists public.pessoa_enderecos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  pessoa_id      uuid not null references public.pessoas(id) on delete cascade,
  tipo_endereco  text default 'principal', -- principal, entrega, cobrança, etc.
  logradouro     text,
  numero         text,
  complemento    text,
  bairro         text,
  cidade         text,
  uf             text,
  cep            text,
  pais           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_pessoa_enderecos_empresa_pessoa on public.pessoa_enderecos (empresa_id, pessoa_id);

drop trigger if exists tg_pessoa_enderecos_updated_at on public.pessoa_enderecos;
create trigger tg_pessoa_enderecos_updated_at
before update on public.pessoa_enderecos
for each row execute function public.tg_set_updated_at();

alter table public.pessoa_enderecos enable row level security;

drop policy if exists pessoa_enderecos_sel on public.pessoa_enderecos;
drop policy if exists pessoa_enderecos_ins on public.pessoa_enderecos;
drop policy if exists pessoa_enderecos_upd on public.pessoa_enderecos;
drop policy if exists pessoa_enderecos_del on public.pessoa_enderecos;

create policy pessoa_enderecos_sel
on public.pessoa_enderecos
for select
using ( public.is_user_member_of(empresa_id) );

create policy pessoa_enderecos_ins
on public.pessoa_enderecos
for insert
with check ( public.is_user_member_of(empresa_id) );

create policy pessoa_enderecos_upd
on public.pessoa_enderecos
for update
using ( public.is_user_member_of(empresa_id) )
with check ( public.is_user_member_of(empresa_id) );

create policy pessoa_enderecos_del
on public.pessoa_enderecos
for delete
using ( public.is_user_member_of(empresa_id) );

-- 3) Tabela pessoa_contatos
create table if not exists public.pessoa_contatos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  pessoa_id      uuid not null references public.pessoas(id) on delete cascade,
  nome           text,
  email          text,
  telefone       text,
  cargo          text,
  observacoes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_pessoa_contatos_empresa_pessoa on public.pessoa_contatos (empresa_id, pessoa_id);

drop trigger if exists tg_pessoa_contatos_updated_at on public.pessoa_contatos;
create trigger tg_pessoa_contatos_updated_at
before update on public.pessoa_contatos
for each row execute function public.tg_set_updated_at();

alter table public.pessoa_contatos enable row level security;

drop policy if exists pessoa_contatos_sel on public.pessoa_contatos;
drop policy if exists pessoa_contatos_ins on public.pessoa_contatos;
drop policy if exists pessoa_contatos_upd on public.pessoa_contatos;
drop policy if exists pessoa_contatos_del on public.pessoa_contatos;

create policy pessoa_contatos_sel
on public.pessoa_contatos
for select
using ( public.is_user_member_of(empresa_id) );

create policy pessoa_contatos_ins
on public.pessoa_contatos
for insert
with check ( public.is_user_member_of(empresa_id) );

create policy pessoa_contatos_upd
on public.pessoa_contatos
for update
using ( public.is_user_member_of(empresa_id) )
with check ( public.is_user_member_of(empresa_id) );

create policy pessoa_contatos_del
on public.pessoa_contatos
for delete
using ( public.is_user_member_of(empresa_id) );

-- 4) Função de validação: empresa do filho deve coincidir com a da pessoa
--    (evita cruzamento multi-tenant em endereços/contatos)
create or replace function public.enforce_same_empresa_pessoa()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pessoa_empresa uuid;
  v_row_empresa    uuid;
begin
  -- Descobre empresa da pessoa alvo
  select empresa_id into v_pessoa_empresa
  from public.pessoas
  where id = coalesce(NEW.pessoa_id, OLD.pessoa_id);

  v_row_empresa := coalesce(NEW.empresa_id, OLD.empresa_id);

  if v_pessoa_empresa is null then
    raise exception 'Pessoa inexistente' using errcode = '23503';
  end if;

  if v_row_empresa is distinct from v_pessoa_empresa then
    raise exception 'empresa_id do registro difere da empresa da pessoa' using errcode = '23514';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

-- Gatilhos de validação nos filhos
drop trigger if exists tg_check_empresa_pessoa_enderecos on public.pessoa_enderecos;
create trigger tg_check_empresa_pessoa_enderecos
before insert or update on public.pessoa_enderecos
for each row execute function public.enforce_same_empresa_pessoa();

drop trigger if exists tg_check_empresa_pessoa_contatos on public.pessoa_contatos;
create trigger tg_check_empresa_pessoa_contatos
before insert or update on public.pessoa_contatos
for each row execute function public.enforce_same_empresa_pessoa();
