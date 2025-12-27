-- Ported from `supabase/migrations_legacy/20251219100000_create_sales_goals_module.sql` (DEV parity)

/*
  Metas de Vendas (módulo)
*/

-- NOTE: este arquivo assume que RBAC (roles/permissions/role_permissions) já existe.

insert into public.permissions(module, action) values
  ('vendas','view'),('vendas','create'),('vendas','update'),('vendas','delete'),('vendas','manage')
on conflict (module, action) do nothing;

insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module = 'vendas'
where r.slug in ('OWNER','ADMIN')
on conflict do nothing;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'meta_tipo') then
    create type public.meta_tipo as enum ('valor','quantidade');
  end if;
end
$$;

create table if not exists public.metas_vendas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  tipo public.meta_tipo not null default 'valor',
  valor_meta numeric not null check (valor_meta >= 0),
  valor_atingido numeric not null default 0 check (valor_atingido >= 0),
  data_inicio date not null,
  data_fim date not null,
  responsavel_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valor_meta_maior_que_atingido check (valor_meta >= valor_atingido),
  constraint data_fim_maior_que_inicio check (data_fim >= data_inicio)
);

create index if not exists ix_metas_vendas_empresa_id     on public.metas_vendas(empresa_id);
create index if not exists ix_metas_vendas_responsavel_id on public.metas_vendas(responsavel_id);

alter table public.metas_vendas enable row level security;
alter table public.metas_vendas force row level security;

drop policy if exists metas_vendas_all_company_members on public.metas_vendas;
create policy metas_vendas_all_company_members
on public.metas_vendas
for all
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_metas_vendas_updated on public.metas_vendas;
create trigger tg_metas_vendas_updated
  before update on public.metas_vendas
  for each row execute function public.tg_set_updated_at();

drop function if exists public.delete_meta_venda(uuid);
create or replace function public.delete_meta_venda(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_permission_for_current_user('vendas','delete') then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.metas_vendas
   where id = p_id
     and empresa_id = public.current_empresa_id();
end;
$$;
revoke all on function public.delete_meta_venda(uuid) from public;
grant execute on function public.delete_meta_venda(uuid) to authenticated;

select pg_notify('pgrst','reload schema');

