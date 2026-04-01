-- ============================================================================
-- Migration: add ncm + cfop to beneficiamento_preview return
-- Purpose: When creating a new product during NF-e XML import, pre-populate
--          the NCM and CFOP fields from the XML data already stored in
--          fiscal_nfe_import_items.
-- ============================================================================

create or replace function public.beneficiamento_preview(
  p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp    uuid := public.current_empresa_id();
  v_head   jsonb;
  v_itens  jsonb;
  v_cnpj   text;
begin
  -- Cabeçalho do import
  select to_jsonb(i.*) - 'xml_raw', i.emitente_cnpj
  into v_head, v_cnpj
  from public.fiscal_nfe_imports i
  where i.id = p_import_id
    and i.empresa_id = v_emp;

  if v_head is null then
    raise exception 'Import não encontrado.';
  end if;

  -- Normalizar CNPJ (só dígitos)
  v_cnpj := regexp_replace(coalesce(v_cnpj, ''), '[^0-9]', '', 'g');

  -- Itens com matching em cascata
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id',    fi.id,
      'n_item',     fi.n_item,
      'cprod',      fi.cprod,
      'ean',        fi.ean,
      'xprod',      fi.xprod,
      'ncm',        fi.ncm,
      'cfop',       fi.cfop,
      'ucom',       fi.ucom,
      'qcom',       fi.qcom,
      'vuncom',     fi.vuncom,
      'vprod',      fi.vprod,
      'n_lote',     fi.n_lote,
      'match_produto_id',   coalesce(dp.produto_id, pe.id, ps.id),
      'match_produto_nome', coalesce(dp_p.nome, pe.nome, ps.nome),
      'match_produto_sku',  coalesce(dp_p.sku, pe.sku, ps.sku),
      'match_produto_gtin', coalesce(dp_p.gtin, pe.gtin, ps.gtin),
      'match_strategy',
        case
          when dp.produto_id is not null then 'depara'
          when pe.id is not null then 'ean'
          when ps.id is not null then 'sku'
          else 'none'
        end
    ) order by fi.n_item
  ), '[]'::jsonb)
  into v_itens
  from public.fiscal_nfe_import_items fi

  -- Prioridade 1: de-para (fornecedor_cnpj + cprod)
  left join lateral (
    select d.produto_id
    from public.produto_fornecedor_depara d
    where d.empresa_id = v_emp
      and d.fornecedor_cnpj = v_cnpj
      and d.cprod_xml = fi.cprod
      and v_cnpj <> ''
      and coalesce(fi.cprod, '') <> ''
    limit 1
  ) dp on true
  left join public.produtos dp_p
    on dp_p.id = dp.produto_id and dp_p.empresa_id = v_emp

  -- Prioridade 2: EAN (somente se válido e de-para não encontrou)
  left join lateral (
    select p.id, p.nome, p.sku, p.gtin
    from public.produtos p
    where p.empresa_id = v_emp
      and p.gtin = fi.ean
      and public._is_valid_ean(fi.ean)
      and dp.produto_id is null
    limit 1
  ) pe on true

  -- Prioridade 3: SKU (cprod = produto.sku, se de-para e EAN não encontraram)
  left join lateral (
    select p.id, p.nome, p.sku, p.gtin
    from public.produtos p
    where p.empresa_id = v_emp
      and p.sku = fi.cprod
      and coalesce(fi.cprod, '') <> ''
      and dp.produto_id is null
      and pe.id is null
    limit 1
  ) ps on true

  where fi.import_id = p_import_id
    and fi.empresa_id = v_emp;

  return jsonb_build_object('import', v_head, 'itens', v_itens);
end;
$$;

revoke all on function public.beneficiamento_preview(uuid) from public;
grant execute on function public.beneficiamento_preview(uuid) to authenticated, service_role;
