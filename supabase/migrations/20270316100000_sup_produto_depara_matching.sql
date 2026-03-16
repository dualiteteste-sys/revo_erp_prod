/*
  SUP: Vinculação de Produtos XML — Estado da Arte

  1. Tabela produto_fornecedor_depara: mapeamento persistente fornecedor+cProd → produto
  2. Helper _is_valid_ean(): filtra "SEM GTIN" e variantes
  3. Rewrite beneficiamento_preview: cascata de-para → EAN → SKU, retorna dados do produto
  4. Rewrite _create_recebimento_from_xml: mesma cascata
  5. RPC produto_fornecedor_depara_save_batch: salva matches em batch
*/

-- ============================================================================
-- 1. Tabela de-para: fornecedor_cnpj + cprod_xml → produto_id
--    Usa CNPJ como chave (disponível no XML antes de cadastrar fornecedor)
-- ============================================================================

create table if not exists public.produto_fornecedor_depara (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null,
  fornecedor_cnpj  text not null,
  cprod_xml        text not null,
  ean_xml          text,
  xprod_xml        text,
  produto_id       uuid not null references public.produtos(id) on delete cascade,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (empresa_id, fornecedor_cnpj, cprod_xml)
);

alter table public.produto_fornecedor_depara enable row level security;

create policy "tenant_isolation" on public.produto_fornecedor_depara
  using (empresa_id = public.current_empresa_id());

-- Bloquear acesso direto (RPC-only)
revoke all on table public.produto_fornecedor_depara from authenticated;

create index if not exists idx_produto_fornecedor_depara_lookup
  on public.produto_fornecedor_depara (empresa_id, fornecedor_cnpj, cprod_xml);


-- ============================================================================
-- 2. Helper: _is_valid_ean(text) → boolean
--    Filtra "SEM GTIN", "SEMGTIN", "NAO INFORMADO", "N/A", all-zeros, vazio
-- ============================================================================

create or replace function public._is_valid_ean(p_ean text)
returns boolean
language sql
immutable
as $$
  select p_ean is not null
    and btrim(p_ean) <> ''
    and upper(btrim(p_ean)) not in ('SEM GTIN','SEMGTIN','NAO INFORMADO','N/A','0')
    and regexp_replace(btrim(p_ean), '[^0-9]', '', 'g') <> '';
$$;


-- ============================================================================
-- 3. Rewrite beneficiamento_preview
--    Cascata: de-para → EAN (válido) → SKU → none
--    Retorna match_produto_nome, match_produto_sku, match_produto_gtin
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


-- ============================================================================
-- 4. Rewrite _create_recebimento_from_xml
--    Mesma cascata de-para → EAN → SKU, filtro "SEM GTIN"
-- ============================================================================

drop function if exists public._create_recebimento_from_xml(uuid);
drop function if exists public._create_recebimento_from_xml(uuid, uuid);

create or replace function public._create_recebimento_from_xml(
  p_import_id     uuid,
  p_fornecedor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp            uuid := public.current_empresa_id();
  v_recebimento_id uuid;
  v_item           record;
  v_prod_id        uuid;
  v_status         text := 'created';
  v_items_count    int  := 0;
  v_cnpj           text;
begin
  -- Obter CNPJ do emitente para de-para
  select regexp_replace(coalesce(i.emitente_cnpj, ''), '[^0-9]', '', 'g')
  into v_cnpj
  from public.fiscal_nfe_imports i
  where i.id = p_import_id and i.empresa_id = v_emp;

  select id into v_recebimento_id
  from public.recebimentos
  where fiscal_nfe_import_id = p_import_id and empresa_id = v_emp;

  if v_recebimento_id is not null then
    if p_fornecedor_id is not null then
      update public.recebimentos
      set fornecedor_id = p_fornecedor_id, updated_at = now()
      where id = v_recebimento_id and empresa_id = v_emp;
    end if;

    select count(*) into v_items_count
    from public.recebimento_itens
    where recebimento_id = v_recebimento_id and empresa_id = v_emp;

    if v_items_count > 0 then
      return jsonb_build_object('id', v_recebimento_id, 'status', 'exists');
    end if;

    v_status := 'reopened';
  else
    insert into public.recebimentos (empresa_id, fiscal_nfe_import_id, fornecedor_id, status)
    values (v_emp, p_import_id, p_fornecedor_id, 'pendente')
    returning id into v_recebimento_id;
  end if;

  for v_item in
    select * from public.fiscal_nfe_import_items
    where import_id = p_import_id and empresa_id = v_emp
  loop
    -- Cascata: de-para → EAN (válido) → SKU
    v_prod_id := null;

    -- 1. De-para
    if v_cnpj <> '' and coalesce(v_item.cprod, '') <> '' then
      select d.produto_id into v_prod_id
      from public.produto_fornecedor_depara d
      where d.empresa_id = v_emp
        and d.fornecedor_cnpj = v_cnpj
        and d.cprod_xml = v_item.cprod
      limit 1;
    end if;

    -- 2. EAN (somente se válido)
    if v_prod_id is null and public._is_valid_ean(v_item.ean) then
      select p.id into v_prod_id
      from public.produtos p
      where p.empresa_id = v_emp and p.gtin = v_item.ean
      limit 1;
    end if;

    -- 3. SKU
    if v_prod_id is null and coalesce(v_item.cprod, '') <> '' then
      select p.id into v_prod_id
      from public.produtos p
      where p.empresa_id = v_emp and p.sku = v_item.cprod
      limit 1;
    end if;

    insert into public.recebimento_itens (
      empresa_id, recebimento_id, fiscal_nfe_item_id, produto_id, quantidade_xml,
      lote, data_fabricacao, data_validade
    ) values (
      v_emp, v_recebimento_id, v_item.id, v_prod_id, v_item.qcom,
      v_item.n_lote, v_item.d_fab, v_item.d_val
    );
  end loop;

  return jsonb_build_object('id', v_recebimento_id, 'status', v_status);
end;
$$;

revoke all on function public._create_recebimento_from_xml(uuid, uuid) from public, authenticated;
grant execute on function public._create_recebimento_from_xml(uuid, uuid) to service_role;

-- Recriar wrapper público
drop function if exists public.create_recebimento_from_xml(uuid);
drop function if exists public.create_recebimento_from_xml(uuid, uuid);

create or replace function public.create_recebimento_from_xml(
  p_import_id     uuid,
  p_fornecedor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_permission_for_current_user('suprimentos', 'create');
  return public._create_recebimento_from_xml(p_import_id, p_fornecedor_id);
end;
$$;

revoke all on function public.create_recebimento_from_xml(uuid, uuid) from public, anon;
grant execute on function public.create_recebimento_from_xml(uuid, uuid) to authenticated, service_role;


-- ============================================================================
-- 5. RPC produto_fornecedor_depara_save_batch
--    Salva/atualiza mapeamentos de-para em batch
--    p_items: [{ cprod_xml, ean_xml, xprod_xml, produto_id }]
-- ============================================================================

create or replace function public.produto_fornecedor_depara_save_batch(
  p_fornecedor_cnpj text,
  p_items           jsonb default '[]'::jsonb
)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp   uuid := public.current_empresa_id();
  v_cnpj  text;
  v_item  jsonb;
  v_count int := 0;
begin
  if v_emp is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  v_cnpj := regexp_replace(coalesce(p_fornecedor_cnpj, ''), '[^0-9]', '', 'g');
  if v_cnpj = '' then
    return 0;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Skip items without cprod or produto_id
    if coalesce(v_item->>'cprod_xml', '') = '' then continue; end if;
    if coalesce(v_item->>'produto_id', '') = '' then continue; end if;

    insert into public.produto_fornecedor_depara (
      empresa_id, fornecedor_cnpj, cprod_xml, ean_xml, xprod_xml, produto_id
    ) values (
      v_emp,
      v_cnpj,
      v_item->>'cprod_xml',
      nullif(btrim(coalesce(v_item->>'ean_xml', '')), ''),
      nullif(btrim(coalesce(v_item->>'xprod_xml', '')), ''),
      (v_item->>'produto_id')::uuid
    )
    on conflict (empresa_id, fornecedor_cnpj, cprod_xml)
    do update set
      produto_id = excluded.produto_id,
      ean_xml    = coalesce(excluded.ean_xml, public.produto_fornecedor_depara.ean_xml),
      xprod_xml  = coalesce(excluded.xprod_xml, public.produto_fornecedor_depara.xprod_xml),
      updated_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.produto_fornecedor_depara_save_batch(text, jsonb) from public, anon;
grant execute on function public.produto_fornecedor_depara_save_batch(text, jsonb) to authenticated, service_role;


-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
