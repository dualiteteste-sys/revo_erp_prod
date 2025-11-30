-- [SECURITY] Seed/normalize de roles essenciais (idempotente)
-- Objetivo: evitar 400 por INVALID_ROLE_SLUG nos convites, sem alterar a Edge Function.

-- 1) Garantir tabela roles com índice único em slug
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='roles'
  ) then
    create table public.roles (
      id uuid primary key default gen_random_uuid(),
      slug text not null unique,
      name text,
      created_at timestamptz default now()
    );
  end if;

  -- índice único (se ainda não existir)
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='roles_slug_key'
  ) then
    create unique index roles_slug_key on public.roles (slug);
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

-- 3) Diagnóstico rápido (somente leitura)
-- Confirma que os slugs existem
select slug, id from public.roles
where slug in ('OWNER','ADMIN','MANAGER','STAFF','VIEWER')
order by slug;

-- 4) (Opcional) Validar vínculos da empresa atual
-- Mostra possíveis convites pendentes e papéis vinculados
select eu.empresa_id, eu.user_id, r.slug as role, eu.status
from public.empresa_usuarios eu
left join public.roles r on r.id = eu.role_id
where eu.empresa_id = public.current_empresa_id()
order by eu.status, r.slug nulls last;
