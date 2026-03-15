/*
  Fix: fiscal_nfe_emissao_draft_upsert não incluía empresa_id
  no INSERT de fiscal_nfe_emissao_itens.
  Erro: 23502 — null value in column "empresa_id" violates not-null constraint
  Afeta: salvar rascunho de NF-e com itens (qualquer fluxo)
*/

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

  -- Inserir novos itens (com empresa_id + campos xPed/infAdProd)
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

-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
