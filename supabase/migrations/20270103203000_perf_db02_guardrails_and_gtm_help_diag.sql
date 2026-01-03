/*
  PERF-DB-02 (Guard rails no backend)
  - Evita listagens "sem fim" via RPC (paginação + limites) e padroniza saneamento de p_limit/p_offset.
  - Impacto: melhora performance e reduz risco de consultas caras acidentais.
  - Reversibilidade: reverter para versões anteriores das funções (migrations anteriores) se necessário.

  GTM-HELP-02 (Diagnóstico “por que não funciona?”)
  - Adiciona uma RPC leve para checks mínimos do PDV (sem depender de múltiplos SELECTs no front).
*/

begin;

-- -----------------------------------------------------------------------------
-- Guard rails: clamp de p_limit/p_offset em RPCs de listagem
-- -----------------------------------------------------------------------------

-- Partners (já tem p_limit/p_offset): apenas clampa e mantém assinatura.
create or replace function public.list_partners_v2(
  p_search text default null,
  p_tipo public.pessoa_tipo default null,
  p_status text default 'active',
  p_limit integer default 50,
  p_offset integer default 0,
  p_order_by text default 'nome',
  p_order_dir text default 'asc'
)
returns table (
  id uuid,
  nome text,
  tipo public.pessoa_tipo,
  doc_unico text,
  email text,
  telefone text,
  deleted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_permission_for_current_user('partners','view');
  return query
  select * from public._list_partners_v2(p_search, p_tipo, p_status, v_limit, v_offset, p_order_by, p_order_dir);
end;
$$;

revoke all on function public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text) from public, anon;
grant execute on function public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text) to authenticated, service_role;

-- Compras: evita overload (PGRST203) e garante paginação no servidor.
drop function if exists public.compras_list_pedidos(text, text);
drop function if exists public.compras_list_pedidos(text, text, integer, integer);
create or replace function public.compras_list_pedidos(
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  numero bigint,
  fornecedor_id uuid,
  fornecedor_nome text,
  data_emissao date,
  data_prevista date,
  status text,
  total_produtos numeric,
  frete numeric,
  desconto numeric,
  total_geral numeric,
  observacoes text,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_permission_for_current_user('suprimentos','view');

  return query
  select
    c.id,
    c.numero,
    c.fornecedor_id,
    f.nome as fornecedor_nome,
    c.data_emissao,
    c.data_prevista,
    c.status::text as status,
    c.total_produtos,
    c.frete,
    c.desconto,
    c.total_geral,
    c.observacoes,
    count(*) over() as total_count
  from public.compras_pedidos c
  left join public.pessoas f on f.id = c.fornecedor_id
  where c.empresa_id = v_emp
    and (
      p_status is null
      or btrim(p_status) = ''
      or c.status::text = p_status
    )
    and (
      p_search is null
      or btrim(p_search) = ''
      or c.numero::text like '%'||btrim(p_search)||'%'
      or lower(coalesce(f.nome,'')) like '%'||lower(btrim(p_search))||'%'
    )
  order by c.numero desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.compras_list_pedidos(text, text, integer, integer) from public, anon;
grant execute on function public.compras_list_pedidos(text, text, integer, integer) to authenticated, service_role;

-- Vendas: migra para paginação server-side e evita listagem total.
drop function if exists public.vendas_list_pedidos(text, text);
drop function if exists public.vendas_list_pedidos(text, text, integer, integer);
create or replace function public.vendas_list_pedidos(
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  numero integer,
  cliente_id uuid,
  cliente_nome text,
  data_emissao date,
  data_entrega date,
  status text,
  total_produtos numeric,
  frete numeric,
  desconto numeric,
  total_geral numeric,
  condicao_pagamento text,
  observacoes text,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_permission_for_current_user('vendas','view');

  if p_status is not null
     and p_status not in ('orcamento','aprovado','cancelado','concluido') then
    raise exception 'Status de pedido inválido.';
  end if;

  return query
  select
    p.id,
    p.numero,
    p.cliente_id,
    c.nome as cliente_nome,
    p.data_emissao,
    p.data_entrega,
    p.status,
    p.total_produtos,
    p.frete,
    p.desconto,
    p.total_geral,
    p.condicao_pagamento,
    p.observacoes,
    count(*) over() as total_count
  from public.vendas_pedidos p
  join public.pessoas c on c.id = p.cliente_id
  where p.empresa_id = v_empresa
    and (p_status is null or p.status = p_status)
    and (
      p_search is null
      or c.nome ilike '%'||p_search||'%'
      or cast(p.numero as text) ilike '%'||p_search||'%'
      or coalesce(p.observacoes,'') ilike '%'||p_search||'%'
    )
  order by p.data_emissao desc, p.numero desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.vendas_list_pedidos(text, text, integer, integer) from public, anon;
grant execute on function public.vendas_list_pedidos(text, text, integer, integer) to authenticated, service_role;

-- Financeiro extrato: clampa p_limit/p_offset
create or replace function public.financeiro_extrato_bancario_list(
  p_conta_corrente_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_tipo_lancamento text default null,
  p_conciliado boolean default null,
  p_q text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  conta_corrente_id uuid,
  conta_nome text,
  data_lancamento date,
  descricao text,
  documento_ref text,
  tipo_lancamento text,
  valor numeric,
  saldo_apos_lancamento numeric,
  conciliado boolean,
  movimentacao_id uuid,
  movimentacao_data date,
  movimentacao_tipo text,
  movimentacao_descricao text,
  movimentacao_valor numeric,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_permission_for_current_user('tesouraria','view');

  if p_tipo_lancamento is not null and p_tipo_lancamento not in ('credito','debito') then
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
  order by e.data_lancamento asc, e.created_at asc, e.id asc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, integer, integer) from public, anon;
grant execute on function public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- GTM-HELP-02: diagnóstico PDV “por que não funciona?”
-- -----------------------------------------------------------------------------

drop function if exists public.pdv_checks_for_current_empresa();
create function public.pdv_checks_for_current_empresa()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_uid uuid := public.current_user_id();

  v_has_products boolean := false;
  v_has_clientes boolean := false;
  v_has_conta_corrente boolean := false;
  v_has_padrao_receb boolean := false;

  v_checks jsonb;
  v_total int := 0;
  v_ok int := 0;
begin
  if v_uid is null or v_empresa_id is null then
    return jsonb_build_object('checks', jsonb_build_array(), 'progress', jsonb_build_object('ok', 0, 'total', 0));
  end if;

  perform public.require_permission_for_current_user('suporte','view');

  if not exists (
    select 1
      from public.empresa_usuarios eu
     where eu.user_id = v_uid
       and eu.empresa_id = v_empresa_id
  ) then
    return jsonb_build_object('checks', jsonb_build_array(), 'progress', jsonb_build_object('ok', 0, 'total', 0));
  end if;

  select exists(select 1 from public.produtos p where p.empresa_id = v_empresa_id and coalesce(p.ativo,true) = true)
    into v_has_products;

  select exists(
    select 1 from public.pessoas pe
    where pe.empresa_id = v_empresa_id
      and coalesce(pe.deleted_at, null) is null
      and pe.tipo in ('cliente','ambos')
  ) into v_has_clientes;

  select exists(select 1 from public.financeiro_contas_correntes cc where cc.empresa_id = v_empresa_id)
    into v_has_conta_corrente;

  select exists(select 1 from public.financeiro_contas_correntes cc where cc.empresa_id = v_empresa_id and cc.padrao_para_recebimentos = true)
    into v_has_padrao_receb;

  v_checks := jsonb_build_array(
    jsonb_build_object(
      'key','pdv.produtos',
      'title','Cadastre produtos',
      'description', case when v_has_products then 'Ok: já existe pelo menos 1 produto ativo.' else 'Sem produtos ativos. Cadastre ou importe um CSV.' end,
      'status', case when v_has_products then 'ok' else 'missing' end,
      'actionLabel','Abrir Produtos',
      'actionHref','/app/products'
    ),
    jsonb_build_object(
      'key','pdv.clientes',
      'title','Cadastre clientes',
      'description', case when v_has_clientes then 'Ok: já existe pelo menos 1 cliente.' else 'Sem clientes. Cadastre um cliente para vender no PDV.' end,
      'status', case when v_has_clientes then 'ok' else 'missing' end,
      'actionLabel','Abrir Clientes',
      'actionHref','/app/partners'
    ),
    jsonb_build_object(
      'key','pdv.conta_corrente',
      'title','Conta corrente (Tesouraria)',
      'description', case when v_has_conta_corrente then 'Ok: existe conta corrente.' else 'Cadastre pelo menos 1 conta (Caixa/Banco) para receber.' end,
      'status', case when v_has_conta_corrente then 'ok' else 'missing' end,
      'actionLabel','Abrir Tesouraria',
      'actionHref','/app/financeiro/tesouraria'
    ),
    jsonb_build_object(
      'key','pdv.padrao_recebimentos',
      'title','Conta padrão (Recebimentos)',
      'description', case when v_has_padrao_receb then 'Ok: conta padrão definida.' else 'Defina uma conta padrão para recebimentos (baixa automática).' end,
      'status', case
        when v_has_padrao_receb then 'ok'
        when v_has_conta_corrente then 'warn'
        else 'missing'
      end,
      'actionLabel','Definir na Tesouraria',
      'actionHref','/app/financeiro/tesouraria'
    )
  );

  v_total := jsonb_array_length(v_checks);
  select count(*) into v_ok
    from jsonb_array_elements(v_checks) as e
   where e->>'status' = 'ok';

  return jsonb_build_object(
    'checks', v_checks,
    'progress', jsonb_build_object('ok', v_ok, 'total', v_total)
  );
end;
$$;

revoke all on function public.pdv_checks_for_current_empresa() from public, anon;
grant execute on function public.pdv_checks_for_current_empresa() to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;
