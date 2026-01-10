-- ============================================================================
-- Onboarding: Centros de Custo (ok quando há 1 receita e 1 despesa)
-- ============================================================================

-- Ajuste: o onboarding antigo verificava `public.centros_de_custo`, mas o app usa
-- `public.financeiro_centros_custos`. Além disso, o requisito mínimo é:
-- - existir pelo menos 1 centro em "Receitas"
-- - existir pelo menos 1 centro em "Despesas" (custos fixos ou variáveis)

create or replace function public.onboarding_checks_for_current_empresa()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_uid uuid := public.current_user_id();

  v_has_empresa_profile boolean := false;
  v_has_conta_corrente boolean := false;
  v_has_padrao_receb boolean := false;
  v_has_padrao_pag boolean := false;
  v_has_cc_receita boolean := false;
  v_has_cc_despesa boolean := false;
  v_has_emitente boolean := false;
  v_has_numeracao boolean := false;

  v_checks jsonb;
  v_total int := 0;
  v_ok int := 0;
begin
  if v_uid is null or v_empresa_id is null then
    return jsonb_build_object('checks', jsonb_build_array(), 'progress', jsonb_build_object('ok', 0, 'total', 0));
  end if;

  -- Safety: garante vínculo do usuário com a empresa ativa
  if not exists (
    select 1
      from public.empresa_usuarios eu
     where eu.user_id = v_uid
       and eu.empresa_id = v_empresa_id
  ) then
    return jsonb_build_object('checks', jsonb_build_array(), 'progress', jsonb_build_object('ok', 0, 'total', 0));
  end if;

  -- Empresa (perfil básico)
  select
    (coalesce(nullif(trim(e.nome_razao_social), ''), '') <> '')
    and (coalesce(nullif(trim(e.cnpj), ''), '') <> '')
    and (coalesce(nullif(trim(e.endereco_logradouro), ''), '') <> '')
    and (coalesce(nullif(trim(e.telefone), ''), '') <> '')
    into v_has_empresa_profile
    from public.empresas e
   where e.id = v_empresa_id;

  -- Tesouraria
  select exists(select 1 from public.financeiro_contas_correntes cc where cc.empresa_id = v_empresa_id)
    into v_has_conta_corrente;
  select exists(select 1 from public.financeiro_contas_correntes cc where cc.empresa_id = v_empresa_id and cc.padrao_para_recebimentos = true)
    into v_has_padrao_receb;
  select exists(select 1 from public.financeiro_contas_correntes cc where cc.empresa_id = v_empresa_id and cc.padrao_para_pagamentos = true)
    into v_has_padrao_pag;

  -- Centros de custo (mínimo: 1 receita e 1 despesa)
  if to_regclass('public.financeiro_centros_custos') is not null then
    select exists(
      select 1
      from public.financeiro_centros_custos c
      where c.empresa_id = v_empresa_id
        and c.parent_id is not null
        and c.tipo = 'receita'
    ) into v_has_cc_receita;

    select exists(
      select 1
      from public.financeiro_centros_custos c
      where c.empresa_id = v_empresa_id
        and c.parent_id is not null
        and c.tipo in ('custo_fixo', 'custo_variavel')
    ) into v_has_cc_despesa;
  elsif to_regclass('public.centros_de_custo') is not null then
    -- compatibilidade com schema histórico
    select exists(select 1 from public.centros_de_custo c where c.empresa_id = v_empresa_id and c.tipo = 'receita')
      into v_has_cc_receita;
    select exists(select 1 from public.centros_de_custo c where c.empresa_id = v_empresa_id and c.tipo in ('despesa','custo','custo_fixo','custo_variavel'))
      into v_has_cc_despesa;
  end if;

  -- Fiscal (NF-e)
  select exists(select 1 from public.fiscal_nfe_emitente fe where fe.empresa_id = v_empresa_id)
    into v_has_emitente;
  select exists(select 1 from public.fiscal_nfe_numeracao fn where fn.empresa_id = v_empresa_id)
    into v_has_numeracao;

  v_checks := jsonb_build_array(
    jsonb_build_object(
      'key','empresa.perfil_basico',
      'title','Empresa (perfil básico)',
      'description', case when v_has_empresa_profile
        then 'Ok: dados básicos da empresa preenchidos.'
        else 'Preencha o mínimo (Razão, CNPJ, Endereço e Telefone) para documentos e relatórios.'
      end,
      'status', case when v_has_empresa_profile then 'ok' else 'warn' end,
      'actionLabel','Completar dados da empresa',
      'actionHref','/app?settings=empresa'
    ),
    jsonb_build_object(
      'key','tesouraria.contas_correntes',
      'title','Contas Correntes',
      'description', case when v_has_conta_corrente
        then 'Ok: já existe pelo menos 1 conta.'
        else 'Cadastre pelo menos 1 conta corrente (Caixa/Banco).'
      end,
      'status', case when v_has_conta_corrente then 'ok' else 'missing' end,
      'actionLabel','Abrir Tesouraria',
      'actionHref','/app/financeiro/tesouraria'
    ),
    jsonb_build_object(
      'key','tesouraria.padrao_recebimentos',
      'title','Conta padrão (Recebimentos)',
      'description', case when v_has_padrao_receb
        then 'Ok: há conta padrão para recebimentos.'
        else 'Defina uma conta padrão para recebimentos (para baixar títulos).'
      end,
      'status', case
        when v_has_padrao_receb then 'ok'
        when v_has_conta_corrente then 'warn'
        else 'missing'
      end,
      'actionLabel','Definir na Tesouraria',
      'actionHref','/app/financeiro/tesouraria'
    ),
    jsonb_build_object(
      'key','tesouraria.padrao_pagamentos',
      'title','Conta padrão (Pagamentos)',
      'description', case when v_has_padrao_pag
        then 'Ok: há conta padrão para pagamentos.'
        else 'Defina uma conta padrão para pagamentos (para pagar títulos).'
      end,
      'status', case
        when v_has_padrao_pag then 'ok'
        when v_has_conta_corrente then 'warn'
        else 'missing'
      end,
      'actionLabel','Definir na Tesouraria',
      'actionHref','/app/financeiro/tesouraria'
    ),
    jsonb_build_object(
      'key','financeiro.centros_de_custo',
      'title','Centro de Custo',
      'description', case
        when v_has_cc_receita and v_has_cc_despesa then 'Ok: existe ao menos 1 centro em Receitas e 1 em Despesas.'
        when v_has_cc_receita and not v_has_cc_despesa then 'Cadastre ao menos 1 centro de custo em Despesas (Custos Fixos ou Variáveis).'
        when (not v_has_cc_receita) and v_has_cc_despesa then 'Cadastre ao menos 1 centro de custo em Receitas.'
        else 'Cadastre ao menos 1 centro em Receitas e 1 em Despesas (Custos Fixos ou Variáveis).'
      end,
      'status', case when (v_has_cc_receita and v_has_cc_despesa) then 'ok' else 'warn' end,
      'actionLabel','Abrir Centros de Custo',
      'actionHref','/app/financeiro/centros-de-custo'
    ),
    jsonb_build_object(
      'key','fiscal.nfe.emitente',
      'title','NF-e: Emitente',
      'description', case when v_has_emitente
        then 'Ok: emitente configurado.'
        else 'Cadastre os dados do emitente para emitir NF-e.'
      end,
      'status', case when v_has_emitente then 'ok' else 'warn' end,
      'actionLabel','Configurar NF-e',
      'actionHref','/app/fiscal/nfe/configuracoes'
    ),
    jsonb_build_object(
      'key','fiscal.nfe.numeracao',
      'title','NF-e: Numeração',
      'description', case when v_has_numeracao
        then 'Ok: série/numeração configurada.'
        else 'Configure série/numeração para emitir NF-e.'
      end,
      'status', case when v_has_numeracao then 'ok' else 'warn' end,
      'actionLabel','Configurar NF-e',
      'actionHref','/app/fiscal/nfe/configuracoes'
    )
  );

  v_total := jsonb_array_length(v_checks);
  select count(*)
    into v_ok
    from jsonb_array_elements(v_checks) as e
   where e->>'status' = 'ok';

  return jsonb_build_object(
    'checks', v_checks,
    'progress', jsonb_build_object('ok', v_ok, 'total', v_total)
  );
end;
$$;

revoke all on function public.onboarding_checks_for_current_empresa() from public, anon;
grant execute on function public.onboarding_checks_for_current_empresa() to authenticated, service_role;

select pg_notify('pgrst','reload schema');

