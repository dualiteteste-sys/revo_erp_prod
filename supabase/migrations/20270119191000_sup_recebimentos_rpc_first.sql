begin;

-- Suprimentos: Recebimentos RPC-first
-- Objetivo:
-- - Remover dependência de `supabase.from('recebimentos'|'recebimento_itens')` no frontend.
-- - Centralizar leitura/edição em RPCs tenant-safe + permission-safe.
-- - Permitir revogar grants diretos das tabelas sem quebrar UI.

-- -----------------------------------------------------------------------------
-- Listar recebimentos (com dados mínimos do XML/import)
-- -----------------------------------------------------------------------------
create or replace function public.suprimentos_recebimentos_list(
  p_status text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('suprimentos','view');

  return query
  select
    jsonb_strip_nulls(
      to_jsonb(r) ||
      jsonb_build_object(
        'fiscal_nfe_imports',
        case
          when i.id is null then null
          else jsonb_strip_nulls(jsonb_build_object(
            'chave_acesso', i.chave_acesso,
            'emitente_nome', i.emitente_nome,
            'emitente_cnpj', i.emitente_cnpj,
            'numero', i.numero,
            'serie', i.serie,
            'total_nf', i.total_nf,
            'pedido_numero', i.pedido_numero
          ))
        end
      )
    )
  from public.recebimentos r
  left join public.fiscal_nfe_imports i on i.id = r.fiscal_nfe_import_id
  where r.empresa_id = public.current_empresa_id()
    and (p_status is null or r.status = p_status)
  order by r.created_at desc;
end;
$$;

revoke all on function public.suprimentos_recebimentos_list(text) from public;
grant execute on function public.suprimentos_recebimentos_list(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Buscar recebimento por id (com import)
-- -----------------------------------------------------------------------------
create or replace function public.suprimentos_recebimento_get(
  p_recebimento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb;
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('suprimentos','view');

  select
    jsonb_strip_nulls(
      to_jsonb(r) ||
      jsonb_build_object(
        'fiscal_nfe_imports',
        case
          when i.id is null then null
          else jsonb_strip_nulls(jsonb_build_object(
            'chave_acesso', i.chave_acesso,
            'emitente_nome', i.emitente_nome,
            'emitente_cnpj', i.emitente_cnpj,
            'numero', i.numero,
            'serie', i.serie,
            'total_nf', i.total_nf,
            'pedido_numero', i.pedido_numero
          ))
        end
      )
    )
  into v_row
  from public.recebimentos r
  left join public.fiscal_nfe_imports i on i.id = r.fiscal_nfe_import_id
  where r.id = p_recebimento_id
    and r.empresa_id = public.current_empresa_id();

  if v_row is null then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

revoke all on function public.suprimentos_recebimento_get(uuid) from public;
grant execute on function public.suprimentos_recebimento_get(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Listar itens do recebimento (com produto e item do XML)
-- -----------------------------------------------------------------------------
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
            'unidade', p.unidade
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

-- -----------------------------------------------------------------------------
-- Setar produto de um item do recebimento
-- -----------------------------------------------------------------------------
create or replace function public.suprimentos_recebimento_item_set_produto(
  p_recebimento_item_id uuid,
  p_produto_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recebimento_id uuid;
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('suprimentos','update');

  select ri.recebimento_id
  into v_recebimento_id
  from public.recebimento_itens ri
  join public.recebimentos r on r.id = ri.recebimento_id
  where ri.id = p_recebimento_item_id
    and r.empresa_id = public.current_empresa_id();

  if v_recebimento_id is null then
    raise exception 'Item do recebimento não encontrado.' using errcode = 'P0001';
  end if;

  -- produto pode ser nulo (desvincular)
  update public.recebimento_itens
  set produto_id = p_produto_id,
      updated_at = now()
  where id = p_recebimento_item_id;
end;
$$;

revoke all on function public.suprimentos_recebimento_item_set_produto(uuid, uuid) from public;
grant execute on function public.suprimentos_recebimento_item_set_produto(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Atualizar custos/rateio do recebimento
-- -----------------------------------------------------------------------------
create or replace function public.suprimentos_recebimento_update_custos(
  p_recebimento_id uuid,
  p_custo_frete numeric default null,
  p_custo_seguro numeric default null,
  p_custo_impostos numeric default null,
  p_custo_outros numeric default null,
  p_rateio_base text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb;
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('suprimentos','update');

  update public.recebimentos r
  set
    custo_frete = coalesce(p_custo_frete, r.custo_frete),
    custo_seguro = coalesce(p_custo_seguro, r.custo_seguro),
    custo_impostos = coalesce(p_custo_impostos, r.custo_impostos),
    custo_outros = coalesce(p_custo_outros, r.custo_outros),
    rateio_base = coalesce(p_rateio_base, r.rateio_base),
    updated_at = now()
  where r.id = p_recebimento_id
    and r.empresa_id = public.current_empresa_id();

  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0001';
  end if;

  v_row := public.suprimentos_recebimento_get(p_recebimento_id);
  return v_row;
end;
$$;

revoke all on function public.suprimentos_recebimento_update_custos(uuid, numeric, numeric, numeric, numeric, text) from public;
grant execute on function public.suprimentos_recebimento_update_custos(uuid, numeric, numeric, numeric, numeric, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Hardening: remover grants diretos das tabelas agora cobertas por RPC
-- -----------------------------------------------------------------------------
revoke all on table public.recebimentos from anon, authenticated;
revoke all on table public.recebimento_itens from anon, authenticated;

commit;
