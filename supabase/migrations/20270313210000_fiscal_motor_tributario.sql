/*
  Fase 2: Motor Tributário
  - RPC fiscal_nfe_calcular_impostos(p_emissao_id)
  - Calcula ICMS/PIS/COFINS/IPI por item baseado na natureza de operação
  - Grava no JSONB impostos de cada item
  - Atualiza totais da emissão
  - Atualiza fiscal_nfe_recalc_totais para somar impostos dos itens
*/

-- =========================================================
-- 1. Atualizar fiscal_nfe_recalc_totais para somar impostos dos itens
-- =========================================================
drop function if exists public.fiscal_nfe_recalc_totais(uuid);
create or replace function public.fiscal_nfe_recalc_totais(
  p_emissao_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid;
  v_total_produtos numeric := 0;
  v_total_descontos numeric := 0;
  v_total_frete numeric := 0;
  v_total_impostos numeric := 0;
begin
  -- Determine empresa_id from the emission
  if public.is_service_role() then
    select e.empresa_id into v_emp
    from public.fiscal_nfe_emissoes e
    where e.id = p_emissao_id;
  else
    v_emp := public.current_empresa_id();
    if v_emp is null then return; end if;
  end if;

  -- Sum product values
  select
    coalesce(sum(i.quantidade * i.valor_unitario), 0),
    coalesce(sum(i.valor_desconto), 0),
    coalesce(sum(
      case
        when i.impostos != '{}'::jsonb and i.impostos ? 'total'
        then (i.impostos->>'total')::numeric
        else 0
      end
    ), 0)
  into v_total_produtos, v_total_descontos, v_total_impostos
  from public.fiscal_nfe_emissao_itens i
  where i.emissao_id = p_emissao_id
    and i.empresa_id = v_emp;

  select coalesce(e.total_frete, 0) into v_total_frete
  from public.fiscal_nfe_emissoes e
  where e.id = p_emissao_id and e.empresa_id = v_emp;

  update public.fiscal_nfe_emissoes set
    total_produtos = v_total_produtos,
    total_descontos = v_total_descontos,
    total_impostos = v_total_impostos,
    total_nfe = greatest(0, v_total_produtos - v_total_descontos + coalesce(v_total_frete, 0) + v_total_impostos),
    valor_total = greatest(0, v_total_produtos - v_total_descontos + coalesce(v_total_frete, 0) + v_total_impostos),
    updated_at = now()
  where id = p_emissao_id
    and empresa_id = v_emp;
end;
$$;

revoke all on function public.fiscal_nfe_recalc_totais(uuid) from public, anon;
grant execute on function public.fiscal_nfe_recalc_totais(uuid) to authenticated, service_role;


-- =========================================================
-- 2. RPC fiscal_nfe_calcular_impostos
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

    -- Total do item (só ICMS e IPI integram o total; PIS/COFINS não agregam ao total da NF-e)
    v_total_imp := 0; -- PIS/COFINS/ICMS não somam no total_nfe (já estão no valor do produto)

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
-- 3. Trigger: atualizar tg_fiscal_nfe_itens_recalc_totais
-- =========================================================
-- O trigger existente chama fiscal_nfe_recalc_totais — a função foi atualizada acima
-- para ler impostos dos itens. Não precisa recriar o trigger, apenas a função.


-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
