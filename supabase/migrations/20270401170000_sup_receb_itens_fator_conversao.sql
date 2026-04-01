-- Migration: Expand suprimentos_recebimento_itens_list to include
-- fator_conversao and unidade_tributavel from the linked product.
-- This enables automatic unit conversion when generating OBs from recebimentos
-- (e.g., MILHEIRO → UN).

create or replace function public.suprimentos_recebimento_itens_list(
  p_recebimento_id uuid
)
returns setof jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('suprimentos','view');

  -- Tenant check via join com recebimentos
  if not exists (
    select 1
    from public.recebimentos r
    where r.id = p_recebimento_id
      and r.empresa_id = public.current_empresa_id()
  ) then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0001';
  end if;

  return query
  select
    jsonb_strip_nulls(
      to_jsonb(ri) ||
      jsonb_build_object(
        'produtos',
        case
          when p.id is null then null
          else jsonb_strip_nulls(jsonb_build_object(
            'nome', p.nome,
            'sku', p.sku,
            'unidade', p.unidade,
            'fator_conversao', p.fator_conversao,
            'unidade_tributavel', p.unidade_tributavel
          ))
        end,
        'fiscal_nfe_import_items',
        case
          when xi.id is null then null
          else jsonb_strip_nulls(jsonb_build_object(
            'xprod', xi.xprod,
            'cprod', xi.cprod,
            'ean', xi.ean,
            'ucom', xi.ucom
          ))
        end
      )
    )
  from public.recebimento_itens ri
  join public.recebimentos r on r.id = ri.recebimento_id
  left join public.produtos p on p.id = ri.produto_id
  left join public.fiscal_nfe_import_items xi on xi.id = ri.fiscal_nfe_item_id
  where ri.recebimento_id = p_recebimento_id
    and r.empresa_id = public.current_empresa_id()
  order by ri.id asc;
end;
$$;

revoke all on function public.suprimentos_recebimento_itens_list(uuid) from public;
grant execute on function public.suprimentos_recebimento_itens_list(uuid) to authenticated, service_role;
