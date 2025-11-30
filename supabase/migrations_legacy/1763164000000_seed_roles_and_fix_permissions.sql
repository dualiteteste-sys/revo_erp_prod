/*
# [Fix] Seed de roles essenciais + permissões em empresa_usuarios

## O que este script faz:
1) Garante que exista a tabela `public.roles` com `slug` único.
2) Faz upsert dos slugs essenciais: OWNER, ADMIN, MANAGER, STAFF, VIEWER.
3) Concede permissões mínimas em `roles` e `empresa_usuarios` para `authenticated` e `service_role`,
   mantendo RLS como camada de isolamento.

## Segurança:
- RLS em `empresas` / `empresa_usuarios` permanece inalterado.
- Apenas adiciona GRANTs necessários para o Supabase/PostgREST operar.
- Idempotente: pode ser rodado mais de uma vez sem efeitos colaterais inesperados.
*/

begin;

-- 1) Garantir tabela roles com índice único em slug
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'roles'
  ) then
    create table public.roles (
      id         uuid primary key default gen_random_uuid(),
      slug       text not null unique,
      name       text,
      created_at timestamptz default now()
    );
  end if;
end
$$;

-- 2) Upsert dos slugs padrão (OWNER/ADMIN/MANAGER/STAFF/VIEWER)
insert into public.roles (slug, name)
values
  ('OWNER',  'Proprietário'),
  ('ADMIN',  'Administrador'),
  ('MANAGER','Gerente'),
  ('STAFF',  'Operador'),
  ('VIEWER', 'Leitura')
on conflict (slug) do update
set name = excluded.name;

-- 3) Permissões mínimas em roles
-- (para consultas e uso em RPCs, se necessário)
grant select on table public.roles to authenticated, service_role;

-- 4) Permissões mínimas em empresa_usuarios
-- RLS já restringe linhas; aqui liberamos operações na tabela.
grant select, insert, update, delete
  on table public.empresa_usuarios
  to authenticated, service_role;

commit;
