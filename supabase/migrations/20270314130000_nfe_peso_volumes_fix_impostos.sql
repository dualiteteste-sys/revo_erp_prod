/*
  Correções para emissão NF-e Estado da Arte:
  1. Peso bruto/líquido e volumes no header da emissão
  2. Fix impostos.total: IPI é "por fora" e deve somar ao total da NF-e
  3. Propagar peso dos produtos na geração de NF-e de pedido
  4. Aceitar peso/volumes no draft_upsert
*/

-- =========================================================
-- 1. Colunas de peso e volumes na emissão (header)
-- =========================================================
alter table public.fiscal_nfe_emissoes
  add column if not exists peso_bruto numeric not null default 0;

alter table public.fiscal_nfe_emissoes
  add column if not exists peso_liquido numeric not null default 0;

alter table public.fiscal_nfe_emissoes
  add column if not exists quantidade_volumes integer not null default 0;

alter table public.fiscal_nfe_emissoes
  add column if not exists especie_volumes text not null default 'VOLUMES';


-- =========================================================
-- 2. Fix fiscal_nfe_calcular_impostos: IPI é "por fora"
--    ICMS/PIS/COFINS são "por dentro" (já no preço do produto)
--    Apenas IPI soma ao total da NF-e
-- =========================================================
drop function if exists public.fiscal_nfe_calcular_impostos(uuid);
create or replace function public.fiscal_nfe_calcular_impostos(
  p_emissao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa   uuid := public.current_empresa_id();
  v_emissao   record;
  v_emitente  record;
  v_dest      record;
  v_nat       record;
  v_item      record;
  v_cfop      text;
  v_base      numeric;
  v_icms_base numeric;
  v_icms_val  numeric;
  v_pis_base  numeric;
  v_pis_val   numeric;
  v_cof_base  numeric;
  v_cof_val   numeric;
  v_ipi_base  numeric;
  v_ipi_val   numeric;
  v_total_imp numeric;
  v_impostos  jsonb;
  v_is_intra  boolean;
  v_count     int := 0;
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  -- Ler emissão
  select * into v_emissao
  from public.fiscal_nfe_emissoes
  where id = p_emissao_id and empresa_id = v_empresa;

  if v_emissao is null then
    raise exception 'Emissão não encontrada.' using errcode='42501';
  end if;

  -- Ler emitente (para CRT e UF)
  select * into v_emitente
  from public.fiscal_nfe_emitente
  where empresa_id = v_empresa;

  -- Ler destinatário UF (para determinar CFOP intra/inter)
  if v_emissao.destinatario_pessoa_id is not null then
    select pe.uf into v_dest
    from public.pessoa_enderecos pe
    where pe.pessoa_id = v_emissao.destinatario_pessoa_id
    limit 1;
  end if;

  -- Ler natureza de operação (master)
  if v_emissao.natureza_operacao_id is not null then
    select * into v_nat
    from public.fiscal_naturezas_operacao
    where id = v_emissao.natureza_operacao_id and empresa_id = v_empresa;
  end if;

  -- Se não tem natureza, retorna sem calcular
  if v_nat is null then
    return jsonb_build_object('ok', false, 'message', 'Nenhuma natureza de operação definida.');
  end if;

  -- Determinar intra/inter
  v_is_intra := (v_emitente.endereco_uf is not null
    and v_dest.uf is not null
    and upper(v_emitente.endereco_uf) = upper(v_dest.uf));

  -- Determinar CFOP
  if v_is_intra then
    v_cfop := coalesce(v_nat.cfop_dentro_uf, v_nat.cfop_fora_uf);
  else
    v_cfop := coalesce(v_nat.cfop_fora_uf, v_nat.cfop_dentro_uf);
  end if;

  -- Iterar itens
  for v_item in
    select *
    from public.fiscal_nfe_emissao_itens
    where emissao_id = p_emissao_id and empresa_id = v_empresa
    order by ordem
  loop
    v_count := v_count + 1;
    v_base := (v_item.quantidade * v_item.valor_unitario) - coalesce(v_item.valor_desconto, 0);
    if v_base < 0 then v_base := 0; end if;

    -- ICMS
    v_icms_base := v_base;
    if v_nat.icms_reducao_base > 0 then
      v_icms_base := v_base * (1 - v_nat.icms_reducao_base / 100);
    end if;

    if coalesce(v_emitente.crt, 3) = 3 then
      -- Regime Normal: calcula ICMS
      v_icms_val := v_icms_base * coalesce(v_nat.icms_aliquota, 0) / 100;
    else
      -- Simples Nacional: ICMS = 0 (cálculo pelo DAS)
      v_icms_val := 0;
    end if;

    -- PIS
    v_pis_base := v_base;
    v_pis_val := v_pis_base * coalesce(v_nat.pis_aliquota, 0) / 100;

    -- COFINS
    v_cof_base := v_base;
    v_cof_val := v_cof_base * coalesce(v_nat.cofins_aliquota, 0) / 100;

    -- IPI
    v_ipi_base := v_base;
    if v_nat.ipi_cst is not null and v_nat.ipi_aliquota > 0 then
      v_ipi_val := v_ipi_base * v_nat.ipi_aliquota / 100;
    else
      v_ipi_val := 0;
    end if;

    -- Total do item: apenas IPI é "por fora" e soma ao total da NF-e
    -- ICMS/PIS/COFINS são "por dentro" (já incluídos no preço do produto)
    v_total_imp := v_ipi_val;

    -- Montar JSONB
    v_impostos := jsonb_build_object(
      'icms', jsonb_build_object(
        'cst', case when coalesce(v_emitente.crt, 3) = 3 then coalesce(v_nat.icms_cst, '00') else null end,
        'csosn', case when coalesce(v_emitente.crt, 3) != 3 then coalesce(v_nat.icms_csosn, '102') else null end,
        'origem', '0',
        'base_calculo', round(v_icms_base, 2),
        'aliquota', coalesce(v_nat.icms_aliquota, 0),
        'valor', round(v_icms_val, 2),
        'reducao_base', coalesce(v_nat.icms_reducao_base, 0)
      ),
      'pis', jsonb_build_object(
        'cst', coalesce(v_nat.pis_cst, '99'),
        'base_calculo', round(v_pis_base, 2),
        'aliquota', coalesce(v_nat.pis_aliquota, 0),
        'valor', round(v_pis_val, 2)
      ),
      'cofins', jsonb_build_object(
        'cst', coalesce(v_nat.cofins_cst, '99'),
        'base_calculo', round(v_cof_base, 2),
        'aliquota', coalesce(v_nat.cofins_aliquota, 0),
        'valor', round(v_cof_val, 2)
      ),
      'total', round(v_total_imp, 2)
    );

    -- IPI (opcional)
    if v_nat.ipi_cst is not null then
      v_impostos := v_impostos || jsonb_build_object(
        'ipi', jsonb_build_object(
          'cst', v_nat.ipi_cst,
          'base_calculo', round(v_ipi_base, 2),
          'aliquota', coalesce(v_nat.ipi_aliquota, 0),
          'valor', round(v_ipi_val, 2)
        )
      );
    end if;

    -- Atualizar item
    update public.fiscal_nfe_emissao_itens set
      impostos = v_impostos,
      cfop = coalesce(v_cfop, cfop),
      cst = case when coalesce(v_emitente.crt, 3) = 3 then coalesce(v_nat.icms_cst, cst) else cst end,
      csosn = case when coalesce(v_emitente.crt, 3) != 3 then coalesce(v_nat.icms_csosn, csosn) else csosn end,
      updated_at = now()
    where id = v_item.id;
  end loop;

  -- Recalcular totais
  perform public.fiscal_nfe_recalc_totais(p_emissao_id);

  return jsonb_build_object(
    'ok', true,
    'items_calculated', v_count,
    'cfop_applied', v_cfop,
    'is_intrastate', v_is_intra
  );
end;
$$;

revoke all on function public.fiscal_nfe_calcular_impostos(uuid) from public, anon;
grant execute on function public.fiscal_nfe_calcular_impostos(uuid) to authenticated, service_role;


-- =========================================================
-- 3. Atualizar gerar_de_pedido: propagar peso dos produtos
-- =========================================================
drop function if exists public.fiscal_nfe_gerar_de_pedido(uuid, text);
create or replace function public.fiscal_nfe_gerar_de_pedido(
  p_pedido_id uuid,
  p_ambiente  text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa    uuid := public.current_empresa_id();
  v_pedido     record;
  v_emitente   record;
  v_ambiente   text;
  v_emissao_id uuid;
  v_ordem      int := 0;
  v_item       record;
  v_nat_op_id  uuid;
  v_peso_bruto numeric := 0;
  v_peso_liq   numeric := 0;
  v_qtd_vol    int := 0;
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  -- Ler pedido
  select * into v_pedido
  from public.vendas_pedidos
  where id = p_pedido_id and empresa_id = v_empresa;

  if v_pedido is null then
    raise exception 'Pedido não encontrado.' using errcode='P0002';
  end if;

  if v_pedido.status != 'aprovado' then
    raise exception 'Pedido precisa estar aprovado para gerar NF-e.' using errcode='P0002';
  end if;

  -- Ler emitente para CRT/UF
  select * into v_emitente
  from public.fiscal_nfe_emitente
  where empresa_id = v_empresa;

  -- Ambiente
  v_ambiente := coalesce(btrim(p_ambiente), 'homologacao');
  if v_ambiente not in ('homologacao', 'producao') then
    v_ambiente := 'homologacao';
  end if;

  -- Buscar natureza "VENDA" padrão
  select id into v_nat_op_id
  from public.fiscal_naturezas_operacao
  where empresa_id = v_empresa
    and ativo = true
    and codigo = 'VENDA'
  limit 1;

  -- Calcular peso total dos itens do pedido
  select
    coalesce(sum(coalesce(p.peso_bruto_kg, 0) * vip.quantidade), 0),
    coalesce(sum(coalesce(p.peso_liquido_kg, 0) * vip.quantidade), 0),
    coalesce(sum(ceil(vip.quantidade)), 0)
  into v_peso_bruto, v_peso_liq, v_qtd_vol
  from public.vendas_itens_pedido vip
  join public.produtos p on p.id = vip.produto_id
  where vip.pedido_id = p_pedido_id
    and vip.empresa_id = v_empresa;

  -- Criar emissão
  insert into public.fiscal_nfe_emissoes (
    empresa_id, status, ambiente,
    destinatario_pessoa_id,
    natureza_operacao, natureza_operacao_id,
    pedido_origem_id,
    total_frete,
    condicao_pagamento_id,
    transportadora_id,
    modalidade_frete,
    peso_bruto, peso_liquido,
    quantidade_volumes, especie_volumes
  ) values (
    v_empresa, 'rascunho', v_ambiente,
    v_pedido.cliente_id,
    coalesce((select descricao from public.fiscal_naturezas_operacao where id = v_nat_op_id), 'Venda de mercadoria'),
    v_nat_op_id,
    p_pedido_id,
    coalesce(v_pedido.valor_frete, 0),
    -- Condição de pagamento do pedido (lookup by name)
    (select id from public.financeiro_condicoes_pagamento
     where empresa_id = v_empresa and nome = v_pedido.condicao_pagamento limit 1),
    -- Transportadora padrão
    (select id from public.logistica_transportadoras
     where empresa_id = v_empresa and padrao_para_frete = true and ativo = true limit 1),
    coalesce(
      (select frete_tipo_padrao from public.logistica_transportadoras
       where empresa_id = v_empresa and padrao_para_frete = true and ativo = true limit 1),
      '9'
    ),
    round(v_peso_bruto, 3), round(v_peso_liq, 3),
    v_qtd_vol, 'VOLUMES'
  )
  returning id into v_emissao_id;

  -- Inserir itens
  for v_item in
    select
      vip.produto_id,
      coalesce(p.nome, 'Item') as descricao,
      coalesce(p.unidade, 'un') as unidade,
      vip.quantidade,
      vip.preco_unitario as valor_unitario,
      coalesce(vip.desconto, 0) as valor_desconto,
      coalesce(p.ncm, '') as ncm,
      coalesce(p.cfop_padrao, '') as cfop,
      coalesce(p.cst_padrao, '') as cst,
      coalesce(p.csosn_padrao, '') as csosn,
      vip.numero_item_pedido,
      vp.numero_pedido_cliente
    from public.vendas_itens_pedido vip
    join public.produtos p on p.id = vip.produto_id
    join public.vendas_pedidos vp on vp.id = vip.pedido_id
    where vip.pedido_id = p_pedido_id
      and vip.empresa_id = v_empresa
    order by vip.created_at
  loop
    v_ordem := v_ordem + 1;
    insert into public.fiscal_nfe_emissao_itens (
      empresa_id, emissao_id, produto_id, descricao, unidade,
      quantidade, valor_unitario, valor_desconto,
      ncm, cfop, cst, csosn, ordem,
      numero_pedido_cliente, numero_item_pedido
    ) values (
      v_empresa, v_emissao_id, v_item.produto_id, v_item.descricao, v_item.unidade,
      v_item.quantidade, v_item.valor_unitario, v_item.valor_desconto,
      v_item.ncm, v_item.cfop, v_item.cst, v_item.csosn, v_ordem,
      v_item.numero_pedido_cliente, v_item.numero_item_pedido
    );
  end loop;

  -- Calcular impostos (se natureza definida)
  if v_nat_op_id is not null then
    perform public.fiscal_nfe_calcular_impostos(v_emissao_id);
  else
    perform public.fiscal_nfe_recalc_totais(v_emissao_id);
  end if;

  -- Gerar duplicatas (se condição de pagamento definida)
  perform public.fiscal_nfe_gerar_duplicatas(v_emissao_id);

  return v_emissao_id;
end;
$$;

revoke all on function public.fiscal_nfe_gerar_de_pedido(uuid, text) from public, anon;
grant execute on function public.fiscal_nfe_gerar_de_pedido(uuid, text) to authenticated, service_role;


-- =========================================================
-- 4. Atualizar draft_upsert: aceitar peso/volumes
-- =========================================================
drop function if exists public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text);
create or replace function public.fiscal_nfe_emissao_draft_upsert(
  p_emissao_id              uuid    default null,
  p_destinatario_pessoa_id  uuid    default null,
  p_ambiente                text    default 'homologacao',
  p_natureza_operacao       text    default null,
  p_total_frete             numeric default 0,
  p_payload                 jsonb   default '{}'::jsonb,
  p_items                   jsonb   default '[]'::jsonb,
  p_natureza_operacao_id    uuid    default null,
  p_forma_pagamento         text    default null,
  p_condicao_pagamento_id   uuid    default null,
  p_transportadora_id       uuid    default null,
  p_modalidade_frete        text    default '9',
  p_peso_bruto              numeric default 0,
  p_peso_liquido            numeric default 0,
  p_quantidade_volumes      integer default 0,
  p_especie_volumes         text    default 'VOLUMES'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa    uuid := public.current_empresa_id();
  v_emissao_id uuid := p_emissao_id;
  v_ambiente   text := coalesce(btrim(p_ambiente), 'homologacao');
  v_nat_op     text := nullif(btrim(coalesce(p_natureza_operacao, '')), '');
  v_nat_op_id  uuid := p_natureza_operacao_id;
  v_frete      numeric := coalesce(p_total_frete, 0);
  v_item       jsonb;
  v_ordem      int := 0;
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  if v_ambiente not in ('homologacao', 'producao') then
    raise exception 'Ambiente inválido.' using errcode='22023';
  end if;

  -- Se natureza_operacao_id fornecido, buscar descricao automaticamente
  if v_nat_op_id is not null and v_nat_op is null then
    select n.descricao into v_nat_op
    from public.fiscal_naturezas_operacao n
    where n.id = v_nat_op_id and n.empresa_id = v_empresa;
  end if;

  if v_emissao_id is not null then
    -- UPDATE existente
    update public.fiscal_nfe_emissoes set
      destinatario_pessoa_id = p_destinatario_pessoa_id,
      ambiente               = v_ambiente,
      natureza_operacao      = v_nat_op,
      natureza_operacao_id   = v_nat_op_id,
      total_frete            = v_frete,
      payload                = p_payload,
      forma_pagamento        = p_forma_pagamento,
      condicao_pagamento_id  = p_condicao_pagamento_id,
      transportadora_id      = p_transportadora_id,
      modalidade_frete       = coalesce(p_modalidade_frete, '9'),
      peso_bruto             = coalesce(p_peso_bruto, 0),
      peso_liquido           = coalesce(p_peso_liquido, 0),
      quantidade_volumes     = coalesce(p_quantidade_volumes, 0),
      especie_volumes        = coalesce(nullif(btrim(p_especie_volumes), ''), 'VOLUMES'),
      updated_at             = now()
    where id = v_emissao_id
      and empresa_id = v_empresa
      and status = 'rascunho';

    if not found then
      raise exception 'Rascunho não encontrado ou já emitido.' using errcode='42501';
    end if;
  else
    -- INSERT novo rascunho
    insert into public.fiscal_nfe_emissoes (
      empresa_id, status, ambiente,
      destinatario_pessoa_id,
      natureza_operacao, natureza_operacao_id,
      total_frete, payload,
      forma_pagamento, condicao_pagamento_id,
      transportadora_id, modalidade_frete,
      peso_bruto, peso_liquido,
      quantidade_volumes, especie_volumes
    ) values (
      v_empresa, 'rascunho', v_ambiente,
      p_destinatario_pessoa_id,
      v_nat_op, v_nat_op_id,
      v_frete, p_payload,
      p_forma_pagamento, p_condicao_pagamento_id,
      p_transportadora_id, coalesce(p_modalidade_frete, '9'),
      coalesce(p_peso_bruto, 0), coalesce(p_peso_liquido, 0),
      coalesce(p_quantidade_volumes, 0), coalesce(nullif(btrim(p_especie_volumes), ''), 'VOLUMES')
    )
    returning id into v_emissao_id;
  end if;

  -- Apagar itens antigos
  delete from public.fiscal_nfe_emissao_itens
  where emissao_id = v_emissao_id;

  -- Inserir novos itens (com campos xPed/infAdProd)
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_ordem := v_ordem + 1;
    insert into public.fiscal_nfe_emissao_itens (
      emissao_id, produto_id, descricao, unidade,
      quantidade, valor_unitario, valor_desconto,
      ncm, cfop, cst, csosn, ordem,
      numero_pedido_cliente, numero_item_pedido, informacoes_adicionais
    ) values (
      v_emissao_id,
      (v_item->>'produto_id')::uuid,
      coalesce(v_item->>'descricao', 'Item'),
      coalesce(v_item->>'unidade', 'un'),
      coalesce((v_item->>'quantidade')::numeric, 1),
      coalesce((v_item->>'valor_unitario')::numeric, 0),
      coalesce((v_item->>'valor_desconto')::numeric, 0),
      v_item->>'ncm',
      v_item->>'cfop',
      v_item->>'cst',
      v_item->>'csosn',
      v_ordem,
      v_item->>'numero_pedido_cliente',
      (v_item->>'numero_item_pedido')::integer,
      v_item->>'informacoes_adicionais'
    );
  end loop;

  -- Recalcular totais
  perform public.fiscal_nfe_recalc_totais(v_emissao_id);

  return v_emissao_id;
end;
$$;

revoke all on function public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text, numeric, numeric, integer, text) from public, anon;
grant execute on function public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text, numeric, numeric, integer, text) to authenticated, service_role;


-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
