/*
  Adiciona campo codigo_beneficio_fiscal (cBenef) nas naturezas de operação.
  Obrigatório pela SEFAZ para CSTs com benefício fiscal (20,30,40,41,50,51,70).
  Obrigatório em: DF, GO, PR, RJ, RS, SC. SP a partir de 06/04/2026.
*/

-- 1. Nova coluna
alter table public.fiscal_naturezas_operacao
  add column if not exists codigo_beneficio_fiscal text;

comment on column public.fiscal_naturezas_operacao.codigo_beneficio_fiscal
  is 'Código de benefício fiscal (cBenef) — ex: SP000202, PR800001. Obrigatório para CSTs 20,30,40,41,50,51,70.';


-- 2. Atualizar UPSERT para aceitar o novo campo
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
      codigo_beneficio_fiscal = p_payload->>'codigo_beneficio_fiscal',
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
      codigo_beneficio_fiscal,
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
      p_payload->>'codigo_beneficio_fiscal',
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


-- 3. Atualizar SEARCH para retornar o novo campo
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
  codigo_beneficio_fiscal text,
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
      n.codigo_beneficio_fiscal,
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


-- 4. Atualizar motor tributário para incluir cBenef no JSONB de impostos
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

    -- Total do item (PIS/COFINS/ICMS não somam no total_nfe — já estão no valor do produto)
    v_total_imp := 0;

    -- Montar JSONB
    v_impostos := jsonb_build_object(
      'icms', jsonb_build_object(
        'cst', case when coalesce(v_emitente.crt, 3) = 3 then coalesce(v_nat.icms_cst, '00') else null end,
        'csosn', case when coalesce(v_emitente.crt, 3) != 3 then coalesce(v_nat.icms_csosn, '102') else null end,
        'origem', '0',
        'base_calculo', round(v_icms_base, 2),
        'aliquota', coalesce(v_nat.icms_aliquota, 0),
        'valor', round(v_icms_val, 2),
        'reducao_base', coalesce(v_nat.icms_reducao_base, 0),
        'codigo_beneficio_fiscal', v_nat.codigo_beneficio_fiscal
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


-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
