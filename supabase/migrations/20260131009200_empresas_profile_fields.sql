/*
  Empresas: campos de cadastro/perfil (Configurações → Empresa)

  Problema em PROD após reset:
  - A tabela `public.empresas` estava com schema mínimo (nome/cnpj/slug...),
    mas a UI e o MainLayout esperam campos como `nome_razao_social`, endereço,
    telefone, etc.
  - Ao salvar, o RPC atualizava "silenciosamente" (pulava colunas ausentes) e
    o form voltava vazio.
*/

BEGIN;

-- Campos principais
alter table public.empresas add column if not exists nome_razao_social text;
alter table public.empresas add column if not exists nome_fantasia text;
alter table public.empresas add column if not exists inscr_estadual text;
alter table public.empresas add column if not exists inscr_municipal text;
alter table public.empresas add column if not exists telefone text;
alter table public.empresas add column if not exists email text;
alter table public.empresas add column if not exists logotipo_url text;

-- Endereço
alter table public.empresas add column if not exists endereco_cep text;
alter table public.empresas add column if not exists endereco_logradouro text;
alter table public.empresas add column if not exists endereco_numero text;
alter table public.empresas add column if not exists endereco_complemento text;
alter table public.empresas add column if not exists endereco_bairro text;
alter table public.empresas add column if not exists endereco_cidade text;
alter table public.empresas add column if not exists endereco_uf text;

-- Backfills (mantém compat com schema antigo)
update public.empresas
set nome_razao_social = coalesce(nome_razao_social, nome)
where nome_razao_social is null;

-- Evita empresa "sem nome" ficar sem razão social
update public.empresas
set nome_razao_social = 'Empresa sem Nome'
where nome_razao_social is null;

select pg_notify('pgrst', 'reload schema');

COMMIT;

