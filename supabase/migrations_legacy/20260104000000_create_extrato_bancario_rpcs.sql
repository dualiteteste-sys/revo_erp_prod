/*
  # Financeiro - Extrato Bancário (RPCs de consulta)

  ## Query Description
  Adiciona RPCs específicas para o módulo "Extrato Bancário",
  reutilizando a tabela existente public.financeiro_extratos_bancarios:

  - financeiro_extrato_bancario_list
    → lista paginada de lançamentos de extrato (por conta ou todas),
      com dados da conta corrente e movimentação conciliada.

  - financeiro_extrato_bancario_summary
    → retorna saldos/totalizadores para os cards do módulo:
      saldo_inicial, créditos, débitos, saldo_final,
      créditos/débitos não conciliados.

  ## Impact Summary
  - Segurança:
    - SECURITY DEFINER + search_path fixo (pg_catalog, public).
    - Filtro explícito por empresa_id = public.current_empresa_id().
    - Respeita RLS existentes em financeiro_extratos_bancarios e
      financeiro_contas_correntes.
  - Compatibilidade:
    - Não altera nenhuma tabela.
    - Funções criadas com create or replace; podem ser chamadas
      pelo módulo Extrato Bancário sem impactar Tesouraria.
  - Reversibilidade:
    - Basta dropar as funções caso o módulo seja removido.
*/

-- =====================================================
-- 0) Limpeza segura de versões anteriores (se houver)
-- =====================================================

drop function if exists public.financeiro_extrato_bancario_list(
  uuid, date, date, text, boolean, text, int, int
);
drop function if exists public.financeiro_extrato_bancario_summary(
  uuid, date, date
);

-- =====================================================
-- 1) Listagem de extrato bancário (paginada)
-- =====================================================

create or replace function public.financeiro_extrato_bancario_list(
  p_conta_corrente_id uuid  default null,  -- null = todas as contas da empresa
  p_start_date        date  default null,
  p_end_date          date  default null,
  p_tipo_lancamento   text  default null,  -- 'credito' | 'debito' | null
  p_conciliado        boolean default null,
  p_q                 text  default null,  -- busca por descrição/doc/identificador
  p_limit             int   default 100,
  p_offset            int   default 0
)
returns table (
  id                      uuid,
  conta_corrente_id       uuid,
  conta_nome              text,
  data_lancamento         date,
  descricao               text,
  documento_ref           text,
  tipo_lancamento         text,
  valor                   numeric,
  saldo_apos_lancamento   numeric,
  conciliado              boolean,
  movimentacao_id         uuid,
  movimentacao_data       date,
  movimentacao_tipo       text,
  movimentacao_descricao  text,
  movimentacao_valor      numeric,
  total_count             bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_tipo_lancamento is not null
     and p_tipo_lancamento not in ('credito','debito') then
    raise exception 'p_tipo_lancamento inválido. Use credito, debito ou null.';
  end if;

  return query
  select
    e.id,
    e.conta_corrente_id,
    cc.nome as conta_nome,
    e.data_lancamento,
    e.descricao,
    e.documento_ref,
    e.tipo_lancamento,
    e.valor,
    e.saldo_apos_lancamento,
    e.conciliado,
    e.movimentacao_id,
    m.data_movimento   as movimentacao_data,
    m.tipo_mov         as movimentacao_tipo,
    m.descricao        as movimentacao_descricao,
    m.valor            as movimentacao_valor,
    count(*) over()    as total_count
  from public.financeiro_extratos_bancarios e
  join public.financeiro_contas_correntes cc
    on cc.id = e.conta_corrente_id
   and cc.empresa_id = v_empresa
  left join public.financeiro_movimentacoes m
    on m.id = e.movimentacao_id
   and m.empresa_id = v_empresa
  where e.empresa_id = v_empresa
    and (p_conta_corrente_id is null or e.conta_corrente_id = p_conta_corrente_id)
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date)
    and (p_conciliado is null or e.conciliado = p_conciliado)
    and (p_tipo_lancamento is null or e.tipo_lancamento = p_tipo_lancamento)
    and (
      p_q is null
      or e.descricao ilike '%'||p_q||'%'
      or coalesce(e.documento_ref,'') ilike '%'||p_q||'%'
      or coalesce(e.identificador_banco,'') ilike '%'||p_q||'%'
    )
  order by
    e.data_lancamento asc,
    e.created_at      asc,
    e.id              asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.financeiro_extrato_bancario_list from public;
grant execute on function public.financeiro_extrato_bancario_list to authenticated, service_role;


-- =====================================================
-- 2) Resumo de extrato bancário (cards do módulo)
-- =====================================================

create or replace function public.financeiro_extrato_bancario_summary(
  p_conta_corrente_id uuid,
  p_start_date        date default null,
  p_end_date          date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa        uuid := public.current_empresa_id();
  v_saldo_inicial  numeric;
  v_creditos       numeric;
  v_debitos        numeric;
  v_saldo_final    numeric;
  v_creditos_nc    numeric;
  v_debitos_nc     numeric;
begin
  if p_conta_corrente_id is null then
    raise exception 'p_conta_corrente_id é obrigatório para o resumo de extrato.';
  end if;

  -- saldo inicial:
  -- 1) Último saldo_apos_lancamento anterior ao período
  -- 2) Se não houver, usa saldo_inicial da conta corrente
  select e.saldo_apos_lancamento
  into v_saldo_inicial
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and (p_start_date is not null and e.data_lancamento < p_start_date)
  order by e.data_lancamento desc, e.created_at desc, e.id desc
  limit 1;

  if v_saldo_inicial is null then
    select cc.saldo_inicial
    into v_saldo_inicial
    from public.financeiro_contas_correntes cc
    where cc.id = p_conta_corrente_id
      and cc.empresa_id = v_empresa;

    v_saldo_inicial := coalesce(v_saldo_inicial, 0);
  end if;

  -- créditos no período
  select coalesce(sum(e.valor),0)
  into v_creditos
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and e.tipo_lancamento = 'credito'
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date);

  -- débitos no período
  select coalesce(sum(e.valor),0)
  into v_debitos
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and e.tipo_lancamento = 'debito'
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date);

  -- créditos não conciliados
  select coalesce(sum(e.valor),0)
  into v_creditos_nc
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and e.tipo_lancamento = 'credito'
    and e.conciliado = false
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date);

  -- débitos não conciliados
  select coalesce(sum(e.valor),0)
  into v_debitos_nc
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and e.tipo_lancamento = 'debito'
    and e.conciliado = false
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date);

  -- saldo final = saldo inicial + créditos - débitos
  v_saldo_final := v_saldo_inicial + v_creditos - v_debitos;

  return jsonb_build_object(
    'saldo_inicial',          v_saldo_inicial,
    'creditos',               v_creditos,
    'debitos',                v_debitos,
    'saldo_final',            v_saldo_final,
    'creditos_nao_conciliados', v_creditos_nc,
    'debitos_nao_conciliados',  v_debitos_nc
  );
end;
$$;

revoke all on function public.financeiro_extrato_bancario_summary from public;
grant execute on function public.financeiro_extrato_bancario_summary to authenticated, service_role;
