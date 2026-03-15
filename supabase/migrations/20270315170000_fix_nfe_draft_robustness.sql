/*
  Fix completo NF-e Draft Robustness:
  1. fiscal_nfe_emissoes_list: retornar todos os campos do draft (natureza_operacao_id,
     forma_pagamento, condicao_pagamento, transportadora, peso/volumes, duplicatas)
  2. fiscal_nfe_emissao_draft_upsert: permitir edição em status 'erro'/'rejeitada'
     (reseta para 'rascunho' ao salvar)
  3. fiscal_nfe_emissao_itens_list: retornar campos infAdProd + impostos JSONB
  4. CST normalization: strip leading zeros em CST de 3 dígitos (090→90)
*/

-- =========================================================
-- 1. REWRITE fiscal_nfe_emissoes_list
--    Adicionar campos que faltavam: natureza_operacao_id,
--    forma_pagamento, condicao_pagamento, transportadora,
--    modalidade_frete, peso/volumes, duplicatas
-- =========================================================

drop function if exists public.fiscal_nfe_emissoes_list(text, text, int);

create or replace function public.fiscal_nfe_emissoes_list(
  p_status text default null,
  p_q      text default null,
  p_limit  int  default 200
)
returns table(
  id                       uuid,
  status                   text,
  numero                   int,
  serie                    int,
  chave_acesso             text,
  destinatario_pessoa_id   uuid,
  destinatario_nome        text,
  ambiente                 text,
  natureza_operacao        text,
  natureza_operacao_id     uuid,
  valor_total              numeric,
  total_produtos           numeric,
  total_descontos          numeric,
  total_frete              numeric,
  total_impostos           numeric,
  total_nfe                numeric,
  payload                  jsonb,
  last_error               text,
  rejection_code           text,
  reprocess_count          int,
  created_at               timestamptz,
  updated_at               timestamptz,
  pedido_origem_id         uuid,
  danfe_url                text,
  xml_url                  text,
  -- Novos campos para persistência do draft
  forma_pagamento          text,
  condicao_pagamento_id    uuid,
  condicao_pagamento_nome  text,
  transportadora_id        uuid,
  transportadora_nome      text,
  modalidade_frete         text,
  duplicatas               jsonb,
  peso_bruto               numeric,
  peso_liquido             numeric,
  quantidade_volumes       int,
  especie_volumes          text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_status  text := nullif(btrim(coalesce(p_status, '')), '');
  v_q       text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit   int  := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  perform public.assert_empresa_role_at_least('member');

  return query
  select
    e.id,
    e.status::text,
    e.numero,
    e.serie,
    e.chave_acesso,
    e.destinatario_pessoa_id,
    p.nome                          as destinatario_nome,
    e.ambiente::text,
    e.natureza_operacao,
    e.natureza_operacao_id,
    e.valor_total,
    e.total_produtos,
    e.total_descontos,
    e.total_frete,
    e.total_impostos,
    e.total_nfe,
    e.payload,
    e.last_error,
    e.rejection_code,
    e.reprocess_count,
    e.created_at,
    e.updated_at,
    e.pedido_origem_id,
    e.danfe_url,
    e.xml_url,
    -- Novos campos
    e.forma_pagamento,
    e.condicao_pagamento_id,
    cp.nome                         as condicao_pagamento_nome,
    e.transportadora_id,
    t.nome                          as transportadora_nome,
    e.modalidade_frete,
    e.duplicatas,
    e.peso_bruto,
    e.peso_liquido,
    e.quantidade_volumes,
    e.especie_volumes
  from public.fiscal_nfe_emissoes e
  left join public.pessoas p on p.id = e.destinatario_pessoa_id
  left join public.financeiro_condicoes_pagamento cp on cp.id = e.condicao_pagamento_id
  left join public.logistica_transportadoras t on t.id = e.transportadora_id
  where e.empresa_id = v_empresa
    and (v_status is null or e.status::text = v_status)
    and (
      v_q is null or (
        coalesce(e.chave_acesso, '') ilike '%' || v_q || '%'
        or coalesce(p.nome, '') ilike '%' || v_q || '%'
        or coalesce(e.status::text, '') ilike '%' || v_q || '%'
        or coalesce(e.numero::text, '') ilike '%' || v_q || '%'
        or coalesce(e.serie::text, '') ilike '%' || v_q || '%'
      )
    )
  order by e.updated_at desc
  limit v_limit;
end;
$$;

revoke all on function public.fiscal_nfe_emissoes_list(text, text, int) from public, anon;
grant execute on function public.fiscal_nfe_emissoes_list(text, text, int) to authenticated, service_role;


-- =========================================================
-- 2. REWRITE fiscal_nfe_emissao_itens_list
--    Adicionar informacoes_adicionais, numero_pedido_cliente,
--    numero_item_pedido, impostos JSONB
-- =========================================================

drop function if exists public.fiscal_nfe_emissao_itens_list(uuid);

create or replace function public.fiscal_nfe_emissao_itens_list(
  p_emissao_id uuid
)
returns table(
  id                      uuid,
  produto_id              uuid,
  descricao               text,
  unidade                 text,
  quantidade              numeric,
  valor_unitario          numeric,
  valor_desconto          numeric,
  ncm                     text,
  cfop                    text,
  cst                     text,
  csosn                   text,
  ordem                   int,
  informacoes_adicionais  text,
  numero_pedido_cliente   text,
  numero_item_pedido      int,
  impostos                jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  perform public.assert_empresa_role_at_least('member');

  return query
  select
    i.id,
    i.produto_id,
    i.descricao,
    i.unidade,
    i.quantidade,
    i.valor_unitario,
    i.valor_desconto,
    i.ncm,
    i.cfop,
    i.cst,
    i.csosn,
    i.ordem,
    i.informacoes_adicionais,
    i.numero_pedido_cliente,
    i.numero_item_pedido,
    i.impostos
  from public.fiscal_nfe_emissao_itens i
  where i.empresa_id = v_empresa
    and i.emissao_id = p_emissao_id
  order by i.ordem asc;
end;
$$;

revoke all on function public.fiscal_nfe_emissao_itens_list(uuid) from public, anon;
grant execute on function public.fiscal_nfe_emissao_itens_list(uuid) to authenticated, service_role;


-- =========================================================
-- 3. REWRITE fiscal_nfe_emissao_draft_upsert
--    Permitir edição quando status IN ('rascunho','erro','rejeitada')
--    Reset para 'rascunho' ao salvar
-- =========================================================

drop function if exists public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text, numeric, numeric, integer, text);

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
    -- UPDATE existente: aceita rascunho, erro e rejeitada (reseta para rascunho)
    update public.fiscal_nfe_emissoes set
      status                 = 'rascunho',
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
      last_error             = null,
      rejection_code         = null,
      updated_at             = now()
    where id = v_emissao_id
      and empresa_id = v_empresa
      and status in ('rascunho', 'erro', 'rejeitada');

    if not found then
      raise exception 'NF-e não encontrada ou já em processamento/autorizada.' using errcode='42501';
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
  where emissao_id = v_emissao_id and empresa_id = v_empresa;

  -- Inserir novos itens
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_ordem := v_ordem + 1;
    insert into public.fiscal_nfe_emissao_itens (
      empresa_id, emissao_id, produto_id, descricao, unidade,
      quantidade, valor_unitario, valor_desconto,
      ncm, cfop, cst, csosn, ordem,
      numero_pedido_cliente, numero_item_pedido, informacoes_adicionais
    ) values (
      v_empresa,
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


-- =========================================================
-- 4. Normalizar CST no motor tributário
--    Strip leading zeros em CST ICMS de 3 dígitos (ex: 090→90)
--    CST ICMS válidos: 00,10,20,30,40,41,50,51,60,70,90
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
  v_icms_cst  text;
  v_pis_cst   text;
  v_cofins_cst text;
  v_ipi_cst   text;
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

  -- Normalizar CSTs (strip leading zeros para CSTs de 3 chars como "090"→"90")
  v_icms_cst := regexp_replace(coalesce(v_nat.icms_cst, '00'), '^0(\d{2})$', '\1');
  v_pis_cst := regexp_replace(coalesce(v_nat.pis_cst, '99'), '^0(\d{2})$', '\1');
  v_cofins_cst := regexp_replace(coalesce(v_nat.cofins_cst, '99'), '^0(\d{2})$', '\1');
  v_ipi_cst := case when v_nat.ipi_cst is not null
    then regexp_replace(v_nat.ipi_cst, '^0(\d{2})$', '\1')
    else null end;

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
      v_icms_val := v_icms_base * coalesce(v_nat.icms_aliquota, 0) / 100;
    else
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

    -- Total: apenas IPI é "por fora"
    v_total_imp := v_ipi_val;

    -- Montar JSONB com CSTs normalizados
    v_impostos := jsonb_build_object(
      'icms', jsonb_build_object(
        'cst', case when coalesce(v_emitente.crt, 3) = 3 then v_icms_cst else null end,
        'csosn', case when coalesce(v_emitente.crt, 3) != 3 then coalesce(v_nat.icms_csosn, '102') else null end,
        'origem', '0',
        'base_calculo', round(v_icms_base, 2),
        'aliquota', coalesce(v_nat.icms_aliquota, 0),
        'valor', round(v_icms_val, 2),
        'reducao_base', coalesce(v_nat.icms_reducao_base, 0)
      ),
      'pis', jsonb_build_object(
        'cst', v_pis_cst,
        'base_calculo', round(v_pis_base, 2),
        'aliquota', coalesce(v_nat.pis_aliquota, 0),
        'valor', round(v_pis_val, 2)
      ),
      'cofins', jsonb_build_object(
        'cst', v_cofins_cst,
        'base_calculo', round(v_cof_base, 2),
        'aliquota', coalesce(v_nat.cofins_aliquota, 0),
        'valor', round(v_cof_val, 2)
      ),
      'total', round(v_total_imp, 2)
    );

    -- IPI (opcional)
    if v_ipi_cst is not null then
      v_impostos := v_impostos || jsonb_build_object(
        'ipi', jsonb_build_object(
          'cst', v_ipi_cst,
          'base_calculo', round(v_ipi_base, 2),
          'aliquota', coalesce(v_nat.ipi_aliquota, 0),
          'valor', round(v_ipi_val, 2)
        )
      );
    end if;

    -- Atualizar item com CSTs normalizados
    update public.fiscal_nfe_emissao_itens set
      impostos = v_impostos,
      cfop = coalesce(v_cfop, cfop),
      cst = case when coalesce(v_emitente.crt, 3) = 3 then v_icms_cst else cst end,
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


-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
