/*
  Adiciona 2º CFOP (secundário) nas naturezas de operação.
  Usado em operações que emitem itens com CFOPs diferentes na mesma nota
  (ex: Retorno e Cobrança → CFOP principal 5124 + 2º CFOP 5902).
*/

-- 1. Novas colunas
alter table public.fiscal_naturezas_operacao
  add column if not exists cfop_secundario_dentro_uf text,
  add column if not exists cfop_secundario_fora_uf   text;

comment on column public.fiscal_naturezas_operacao.cfop_secundario_dentro_uf
  is '2º CFOP dentro UF — para itens secundários na mesma nota (ex: 5902)';
comment on column public.fiscal_naturezas_operacao.cfop_secundario_fora_uf
  is '2º CFOP fora UF — para itens secundários na mesma nota (ex: 6902)';


-- 2. Atualizar UPSERT para aceitar os novos campos
drop function if exists public.fiscal_naturezas_operacao_upsert(jsonb);
create or replace function public.fiscal_naturezas_operacao_upsert(
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid := (p_payload->>'id')::uuid;
  v_result  uuid;
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;
  perform public.assert_empresa_role_at_least('admin');

  if v_id is not null then
    -- UPDATE
    update public.fiscal_naturezas_operacao set
      codigo            = coalesce(p_payload->>'codigo', codigo),
      descricao         = coalesce(p_payload->>'descricao', descricao),
      cfop_dentro_uf    = p_payload->>'cfop_dentro_uf',
      cfop_fora_uf      = p_payload->>'cfop_fora_uf',
      cfop_secundario_dentro_uf = p_payload->>'cfop_secundario_dentro_uf',
      cfop_secundario_fora_uf   = p_payload->>'cfop_secundario_fora_uf',
      icms_cst          = p_payload->>'icms_cst',
      icms_csosn        = p_payload->>'icms_csosn',
      icms_aliquota     = coalesce((p_payload->>'icms_aliquota')::numeric, 0),
      icms_reducao_base = coalesce((p_payload->>'icms_reducao_base')::numeric, 0),
      pis_cst           = coalesce(p_payload->>'pis_cst', '99'),
      pis_aliquota      = coalesce((p_payload->>'pis_aliquota')::numeric, 0),
      cofins_cst        = coalesce(p_payload->>'cofins_cst', '99'),
      cofins_aliquota   = coalesce((p_payload->>'cofins_aliquota')::numeric, 0),
      ipi_cst           = p_payload->>'ipi_cst',
      ipi_aliquota      = coalesce((p_payload->>'ipi_aliquota')::numeric, 0),
      gera_financeiro   = coalesce((p_payload->>'gera_financeiro')::boolean, true),
      movimenta_estoque = coalesce((p_payload->>'movimenta_estoque')::boolean, true),
      finalidade_emissao = coalesce(p_payload->>'finalidade_emissao', '1'),
      tipo_operacao     = coalesce(p_payload->>'tipo_operacao', 'saida'),
      observacoes_padrao = p_payload->>'observacoes_padrao',
      regime_aplicavel  = coalesce(p_payload->>'regime_aplicavel', 'ambos'),
      ativo             = coalesce((p_payload->>'ativo')::boolean, true)
    where id = v_id
      and empresa_id = v_empresa
    returning id into v_result;

    if v_result is null then
      raise exception 'Natureza de operação não encontrada ou sem permissão.' using errcode='42501';
    end if;
  else
    -- INSERT
    insert into public.fiscal_naturezas_operacao (
      empresa_id, codigo, descricao,
      cfop_dentro_uf, cfop_fora_uf,
      cfop_secundario_dentro_uf, cfop_secundario_fora_uf,
      icms_cst, icms_csosn, icms_aliquota, icms_reducao_base,
      pis_cst, pis_aliquota,
      cofins_cst, cofins_aliquota,
      ipi_cst, ipi_aliquota,
      gera_financeiro, movimenta_estoque, finalidade_emissao, tipo_operacao,
      observacoes_padrao, regime_aplicavel, ativo
    ) values (
      v_empresa,
      coalesce(p_payload->>'codigo', 'N/A'),
      coalesce(p_payload->>'descricao', 'Nova Natureza'),
      p_payload->>'cfop_dentro_uf',
      p_payload->>'cfop_fora_uf',
      p_payload->>'cfop_secundario_dentro_uf',
      p_payload->>'cfop_secundario_fora_uf',
      p_payload->>'icms_cst',
      p_payload->>'icms_csosn',
      coalesce((p_payload->>'icms_aliquota')::numeric, 0),
      coalesce((p_payload->>'icms_reducao_base')::numeric, 0),
      coalesce(p_payload->>'pis_cst', '99'),
      coalesce((p_payload->>'pis_aliquota')::numeric, 0),
      coalesce(p_payload->>'cofins_cst', '99'),
      coalesce((p_payload->>'cofins_aliquota')::numeric, 0),
      p_payload->>'ipi_cst',
      coalesce((p_payload->>'ipi_aliquota')::numeric, 0),
      coalesce((p_payload->>'gera_financeiro')::boolean, true),
      coalesce((p_payload->>'movimenta_estoque')::boolean, true),
      coalesce(p_payload->>'finalidade_emissao', '1'),
      coalesce(p_payload->>'tipo_operacao', 'saida'),
      p_payload->>'observacoes_padrao',
      coalesce(p_payload->>'regime_aplicavel', 'ambos'),
      coalesce((p_payload->>'ativo')::boolean, true)
    )
    returning id into v_result;
  end if;

  return v_result;
end;
$$;

revoke all on function public.fiscal_naturezas_operacao_upsert(jsonb) from public, anon;
grant execute on function public.fiscal_naturezas_operacao_upsert(jsonb) to authenticated, service_role;


-- 3. Atualizar SEARCH para retornar os novos campos
drop function if exists public.fiscal_naturezas_operacao_search(text, int);
create or replace function public.fiscal_naturezas_operacao_search(
  p_q     text default null,
  p_limit int  default 15
)
returns table (
  id              uuid,
  codigo          text,
  descricao       text,
  cfop_dentro_uf  text,
  cfop_fora_uf    text,
  cfop_secundario_dentro_uf text,
  cfop_secundario_fora_uf   text,
  icms_cst        text,
  icms_csosn      text,
  icms_aliquota   numeric,
  icms_reducao_base numeric,
  pis_cst         text,
  pis_aliquota    numeric,
  cofins_cst      text,
  cofins_aliquota numeric,
  ipi_cst         text,
  ipi_aliquota    numeric,
  finalidade_emissao text,
  observacoes_padrao text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_q       text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit   int  := least(greatest(coalesce(p_limit, 15), 1), 50);
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  return query
    select
      n.id, n.codigo, n.descricao,
      n.cfop_dentro_uf, n.cfop_fora_uf,
      n.cfop_secundario_dentro_uf, n.cfop_secundario_fora_uf,
      n.icms_cst, n.icms_csosn,
      n.icms_aliquota, n.icms_reducao_base,
      n.pis_cst, n.pis_aliquota,
      n.cofins_cst, n.cofins_aliquota,
      n.ipi_cst, n.ipi_aliquota,
      n.finalidade_emissao,
      n.observacoes_padrao
    from public.fiscal_naturezas_operacao n
    where n.empresa_id = v_empresa
      and n.ativo = true
      and (
        v_q is null
        or n.descricao ilike '%' || v_q || '%'
        or n.codigo ilike '%' || v_q || '%'
        or n.cfop_dentro_uf ilike '%' || v_q || '%'
        or n.cfop_fora_uf ilike '%' || v_q || '%'
      )
    order by
      case when v_q is not null and n.descricao ilike v_q || '%' then 0 else 1 end,
      n.descricao
    limit v_limit;
end;
$$;

revoke all on function public.fiscal_naturezas_operacao_search(text, int) from public, anon;
grant execute on function public.fiscal_naturezas_operacao_search(text, int) to authenticated, service_role;


-- 4. Seed: atualizar RET_COBR com 2º CFOP
update public.fiscal_naturezas_operacao
set cfop_secundario_dentro_uf = '5902',
    cfop_secundario_fora_uf   = '6902'
where codigo = 'RET_COBR'
  and is_system = true
  and cfop_secundario_dentro_uf is null;

-- Atualizar seed function para incluir 2º CFOP no RET_COBR
drop function if exists public.fiscal_naturezas_operacao_seed_defaults(uuid);
create or replace function public.fiscal_naturezas_operacao_seed_defaults(
  p_empresa_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  values (p_empresa_id, 'VENDA', 'Venda de mercadoria', '5102', '6102', '00', '102', '99', '99', '1', true)
  on conflict (empresa_id, codigo) do nothing;

  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  values (p_empresa_id, 'VENDA_PROD', 'Venda de produção do estabelecimento', '5101', '6101', '00', '102', '99', '99', '1', true)
  on conflict (empresa_id, codigo) do nothing;

  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  values (p_empresa_id, 'DEVOL_COMPRA', 'Devolução de compra', '5202', '6202', '00', '102', '99', '99', '4', true)
  on conflict (empresa_id, codigo) do nothing;

  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  values (p_empresa_id, 'REM_INDUST', 'Remessa para industrialização', '5901', '6901', '00', '300', '99', '99', false, '1', true)
  on conflict (empresa_id, codigo) do nothing;

  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  values (p_empresa_id, 'RET_INDUST', 'Retorno de industrialização', '5902', '6902', '00', '300', '99', '99', false, '1', true)
  on conflict (empresa_id, codigo) do nothing;

  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  values (p_empresa_id, 'REM_BENEF', 'Remessa para beneficiamento', '5924', '6924', '00', '300', '99', '99', false, '1', true)
  on conflict (empresa_id, codigo) do nothing;

  -- Retorno e cobrança: CFOP principal 5124/6124 + 2º CFOP 5902/6902
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, cfop_secundario_dentro_uf, cfop_secundario_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  values (p_empresa_id, 'RET_COBR', 'Retorno e cobrança', '5124', '6124', '5902', '6902', '00', '102', '99', '99', '1', true)
  on conflict (empresa_id, codigo) do nothing;

  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  values (p_empresa_id, 'TRANSFER', 'Transferência', '5152', '6152', '00', '300', '99', '99', false, '1', true)
  on conflict (empresa_id, codigo) do nothing;
end;
$$;

revoke all on function public.fiscal_naturezas_operacao_seed_defaults(uuid) from public, anon;
grant execute on function public.fiscal_naturezas_operacao_seed_defaults(uuid) to authenticated, service_role;


-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
