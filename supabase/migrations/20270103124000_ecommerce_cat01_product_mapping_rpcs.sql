/*
  CAT-01: Mapeamento SKU/variação (produto ↔ anúncio do canal)

  Estrutura:
  - Reaproveita public.produto_anuncios (ecommerce_id, identificador)
  - RPCs para listar e fazer upsert/delete de mapeamento (guardado por RBAC ecommerce:manage)
*/

BEGIN;

create extension if not exists pgcrypto;

drop function if exists public.ecommerce_product_mappings_list(text, text, int, int);
create function public.ecommerce_product_mappings_list(
  p_provider text,
  p_q text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  produto_id uuid,
  produto_nome text,
  produto_sku text,
  anuncio_identificador text,
  ecommerce_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_provider text := lower(coalesce(p_provider,''));
  v_ecommerce_id uuid;
  v_q text := nullif(trim(p_q),'');
begin
  perform public.require_permission_for_current_user('ecommerce','manage');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;
  if v_provider not in ('meli','shopee') then
    raise exception 'provider inválido' using errcode = '22023';
  end if;

  select e.id into v_ecommerce_id
  from public.ecommerces e
  where e.empresa_id = v_empresa and e.provider = v_provider
  limit 1;

  if v_ecommerce_id is null then
    return;
  end if;

  return query
  select
    p.id as produto_id,
    p.nome as produto_nome,
    p.sku as produto_sku,
    a.identificador as anuncio_identificador,
    v_ecommerce_id as ecommerce_id
  from public.produtos p
  left join public.produto_anuncios a
    on a.empresa_id = v_empresa
   and a.ecommerce_id = v_ecommerce_id
   and a.produto_id = p.id
  where p.empresa_id = v_empresa
    and p.pode_vender = true
    and (
      v_q is null
      or p.nome ilike ('%'||v_q||'%')
      or p.sku ilike ('%'||v_q||'%')
      or a.identificador ilike ('%'||v_q||'%')
    )
  order by p.nome asc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.ecommerce_product_mappings_list(text, text, int, int) from public;
grant execute on function public.ecommerce_product_mappings_list(text, text, int, int) to authenticated, service_role;

drop function if exists public.ecommerce_product_mapping_upsert(text, uuid, text);
create function public.ecommerce_product_mapping_upsert(
  p_provider text,
  p_produto_id uuid,
  p_identificador text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_provider text := lower(coalesce(p_provider,''));
  v_ecommerce_id uuid;
  v_ident text := nullif(trim(p_identificador),'');
begin
  perform public.require_permission_for_current_user('ecommerce','manage');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;
  if v_provider not in ('meli','shopee') then
    raise exception 'provider inválido' using errcode = '22023';
  end if;
  if p_produto_id is null then
    raise exception 'produto_id inválido' using errcode = '22023';
  end if;

  select e.id into v_ecommerce_id
  from public.ecommerces e
  where e.empresa_id = v_empresa and e.provider = v_provider
  limit 1;

  if v_ecommerce_id is null then
    raise exception 'Conexão não encontrada' using errcode = 'P0002';
  end if;

  if v_ident is null then
    delete from public.produto_anuncios
    where empresa_id = v_empresa
      and ecommerce_id = v_ecommerce_id
      and produto_id = p_produto_id;
    return;
  end if;

  insert into public.produto_anuncios (empresa_id, produto_id, ecommerce_id, identificador, descricao, descricao_complementar)
  values (v_empresa, p_produto_id, v_ecommerce_id, v_ident, null, null)
  on conflict (ecommerce_id, identificador) do update set
    produto_id = excluded.produto_id,
    updated_at = now();
end;
$$;

revoke all on function public.ecommerce_product_mapping_upsert(text, uuid, text) from public;
grant execute on function public.ecommerce_product_mapping_upsert(text, uuid, text) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

