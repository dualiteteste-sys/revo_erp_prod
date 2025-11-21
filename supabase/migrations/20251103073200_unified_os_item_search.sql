/*
# [Refactor] Unificar busca de itens para Ordem de Serviço
[This migration unifies the product and service search for the OS item autocomplete into a single, optimized RPC function. It also addresses the 'Mutable Search Path' security advisory by explicitly setting the search_path.]

## Query Description: [This operation replaces two older RPC functions (`search_products_for_os`, `search_services_for_os`) with a new one (`search_items_for_os`). It is non-destructive to data but will break frontend components that still rely on the old functions. The frontend changes are being provided simultaneously.]

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Medium"]
- Requires-Backup: [false]
- Reversible: [false]

## Structure Details:
- Functions Dropped: `search_products_for_os(text)`, `search_services_for_os(text)`
- Functions Created: `search_items_for_os(text, integer)`

## Security Implications:
- RLS Status: [N/A - Function-level security]
- Policy Changes: [No]
- Auth Requirements: [authenticated]
- Fixes Advisory: [Addresses 'Function Search Path Mutable' by setting a safe search_path.]

## Performance Impact:
- Indexes: [Relies on existing indexes on `produtos(nome)` and `servicos(descricao)`]
- Triggers: [No]
- Estimated Impact: [Positive. Reduces two separate queries to one.]
*/

-- Drop old functions if they exist
drop function if exists public.search_products_for_os(text);
drop function if exists public.search_services_for_os(text);

-- Create the new unified search function
create or replace function public.search_items_for_os(p_search text, p_limit integer)
returns table(id uuid, type text, descricao text, codigo text, preco_venda numeric)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with items as (
    -- Search for products
    select
      p.id,
      'product' as type,
      p.nome as descricao,
      p.sku as codigo,
      p.preco_venda
    from
      public.produtos p
    where
      p.empresa_id = public.current_empresa_id()
      and p.status = 'ativo'
      and p.permitir_inclusao_vendas = true
      and p.nome ilike '%' || p_search || '%'
    
    union all
    
    -- Search for services
    select
      s.id,
      'service' as type,
      s.descricao,
      s.codigo,
      s.preco_venda::numeric
    from
      public.servicos s
    where
      s.empresa_id = public.current_empresa_id()
      and s.status = 'ativo'
      and s.descricao ilike '%' || p_search || '%'
  )
  select * from items
  order by
    case
      when items.descricao ilike p_search || '%' then 1 -- Exact start match
      else 2
    end,
    items.descricao
  limit p_limit;
end;
$$;

-- Permissions
revoke all on function public.search_items_for_os(text, integer) from public;
grant execute on function public.search_items_for_os(text, integer) to authenticated, service_role;
