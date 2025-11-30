-- View de compatibilidade: sempre entregar o shape "novo"
create or replace view public.produtos_compat_view as
with novo as (
  select
    p.id,
    p.empresa_id,
    p.nome,
    p.sku,
    p.preco_venda::numeric as preco_venda,
    p.unidade,
    p.status::public.status_produto as status,
    p.created_at,
    p.updated_at
  from public.produtos p
),
legado as (
  select
    pl.id,
    pl.empresa_id,
    pl.name        as nome,
    pl.sku         as sku,
    (pl.price_cents::numeric / 100.0) as preco_venda,         -- cents → reais
    pl.unit        as unidade,
    (case when pl.active then 'ativo' else 'inativo' end)::public.status_produto as status,
    pl.created_at,
    pl.updated_at
  from public.products pl
)
select * from novo
union all
select * from legado;

-- Opcional: facilitar filtro por empresa atual sem depender de claim custom
-- (apenas SELECT helper; não altera RLS)
create or replace function public.produtos_list_for_current_user()
returns setof public.produtos_compat_view
language sql
stable
set search_path = pg_catalog, public
as $$
  select v.*
    from public.produtos_compat_view v
   where exists (
     select 1
       from public.empresa_usuarios eu
      where eu.empresa_id = v.empresa_id
        and eu.user_id = auth.uid()
   );
$$;
