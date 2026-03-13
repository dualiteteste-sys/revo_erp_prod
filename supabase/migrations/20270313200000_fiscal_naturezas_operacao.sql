/*
  Fase 1: Natureza de Operação — Master Table, RPCs, Seed, FK
  - Tabela fiscal_naturezas_operacao (template fiscal para NF-e)
  - CRUD RPCs (list, get, upsert, delete, search)
  - Seed com naturezas comuns
  - FK em fiscal_nfe_emissoes
*/

-- =========================================================
-- 1. TABELA
-- =========================================================
create table if not exists public.fiscal_naturezas_operacao (
  id               uuid not null default gen_random_uuid(),
  empresa_id       uuid not null default public.current_empresa_id(),
  codigo           text not null,
  descricao        text not null,

  -- CFOP par (intra/inter UF)
  cfop_dentro_uf   text,           -- ex: '5102'
  cfop_fora_uf     text,           -- ex: '6102'

  -- ICMS
  icms_cst         text,           -- CST para regime Normal
  icms_csosn       text,           -- CSOSN para Simples Nacional
  icms_aliquota    numeric not null default 0,
  icms_reducao_base numeric not null default 0,

  -- PIS
  pis_cst          text not null default '99',
  pis_aliquota     numeric not null default 0,

  -- COFINS
  cofins_cst       text not null default '99',
  cofins_aliquota  numeric not null default 0,

  -- IPI
  ipi_cst          text,
  ipi_aliquota     numeric not null default 0,

  -- Flags de comportamento
  gera_financeiro       bool not null default true,
  movimenta_estoque     bool not null default true,
  finalidade_emissao    text not null default '1'
    check (finalidade_emissao in ('1','2','3','4')),
  tipo_operacao         text not null default 'saida'
    check (tipo_operacao in ('saida','entrada')),

  -- Observações padrão (info complementares)
  observacoes_padrao    text,

  -- Filtro de regime tributário
  regime_aplicavel      text not null default 'ambos'
    check (regime_aplicavel in ('simples','normal','ambos')),

  -- Meta
  ativo            bool not null default true,
  is_system        bool not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint fiscal_naturezas_operacao_pkey primary key (id),
  constraint fiscal_naturezas_operacao_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fiscal_naturezas_operacao_codigo_uq
    unique (empresa_id, codigo)
);

-- Indexes
create index if not exists idx_fiscal_natop_empresa
  on public.fiscal_naturezas_operacao (empresa_id);
create index if not exists idx_fiscal_natop_empresa_ativo
  on public.fiscal_naturezas_operacao (empresa_id, ativo);
create index if not exists idx_fiscal_natop_descricao_trgm
  on public.fiscal_naturezas_operacao using gin (descricao gin_trgm_ops);

-- RLS
alter table public.fiscal_naturezas_operacao enable row level security;

create policy "fiscal_natop_select" on public.fiscal_naturezas_operacao
  for select using (empresa_id = public.current_empresa_id());
create policy "fiscal_natop_insert" on public.fiscal_naturezas_operacao
  for insert with check (empresa_id = public.current_empresa_id());
create policy "fiscal_natop_update" on public.fiscal_naturezas_operacao
  for update using (empresa_id = public.current_empresa_id())
           with check (empresa_id = public.current_empresa_id());
create policy "fiscal_natop_delete" on public.fiscal_naturezas_operacao
  for delete using (empresa_id = public.current_empresa_id());

-- Revoke direct client access
revoke all on table public.fiscal_naturezas_operacao from authenticated;

-- Trigger updated_at
create trigger handle_updated_at_fiscal_naturezas_operacao
  before update on public.fiscal_naturezas_operacao
  for each row execute procedure public.tg_set_updated_at();


-- =========================================================
-- 2. FK em fiscal_nfe_emissoes
-- =========================================================
alter table public.fiscal_nfe_emissoes
  add column if not exists natureza_operacao_id uuid
    references public.fiscal_naturezas_operacao(id) on delete set null;


-- =========================================================
-- 3. RPCs
-- =========================================================

-- 3.1 LIST
drop function if exists public.fiscal_naturezas_operacao_list(text, text, text, boolean, int);
create or replace function public.fiscal_naturezas_operacao_list(
  p_q         text    default null,
  p_tipo      text    default null,
  p_regime    text    default null,
  p_ativo     boolean default true,
  p_limit     int     default 200
)
returns setof public.fiscal_naturezas_operacao
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_q       text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit   int  := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  return query
    select *
    from public.fiscal_naturezas_operacao n
    where n.empresa_id = v_empresa
      and (p_ativo is null or n.ativo = p_ativo)
      and (p_tipo is null or n.tipo_operacao = p_tipo)
      and (p_regime is null or n.regime_aplicavel in (p_regime, 'ambos'))
      and (
        v_q is null
        or n.descricao ilike '%' || v_q || '%'
        or n.codigo ilike '%' || v_q || '%'
        or n.cfop_dentro_uf ilike '%' || v_q || '%'
        or n.cfop_fora_uf ilike '%' || v_q || '%'
      )
    order by n.descricao
    limit v_limit;
end;
$$;

revoke all on function public.fiscal_naturezas_operacao_list(text, text, text, boolean, int) from public, anon;
grant execute on function public.fiscal_naturezas_operacao_list(text, text, text, boolean, int) to authenticated, service_role;


-- 3.2 GET
drop function if exists public.fiscal_naturezas_operacao_get(uuid);
create or replace function public.fiscal_naturezas_operacao_get(
  p_id uuid
)
returns setof public.fiscal_naturezas_operacao
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

  return query
    select *
    from public.fiscal_naturezas_operacao n
    where n.id = p_id
      and n.empresa_id = v_empresa;
end;
$$;

revoke all on function public.fiscal_naturezas_operacao_get(uuid) from public, anon;
grant execute on function public.fiscal_naturezas_operacao_get(uuid) to authenticated, service_role;


-- 3.3 UPSERT
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


-- 3.4 DELETE (soft)
drop function if exists public.fiscal_naturezas_operacao_delete(uuid);
create or replace function public.fiscal_naturezas_operacao_delete(
  p_id uuid
)
returns void
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
  perform public.assert_empresa_role_at_least('admin');

  update public.fiscal_naturezas_operacao
  set ativo = false
  where id = p_id
    and empresa_id = v_empresa;
end;
$$;

revoke all on function public.fiscal_naturezas_operacao_delete(uuid) from public, anon;
grant execute on function public.fiscal_naturezas_operacao_delete(uuid) to authenticated, service_role;


-- 3.5 SEARCH (para autocomplete — retorno leve)
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


-- =========================================================
-- 4. SEED — Naturezas de Operação comuns (inseridas para cada empresa existente)
-- =========================================================
-- Seed é feito na RPC de upsert pelo admin, ou manualmente.
-- Aqui criamos uma função auxiliar para popular as naturezas padrão de uma empresa.

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
  -- Venda de mercadoria
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  values (p_empresa_id, 'VENDA', 'Venda de mercadoria', '5102', '6102', '00', '102', '99', '99', '1', true)
  on conflict (empresa_id, codigo) do nothing;

  -- Venda de produção
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  values (p_empresa_id, 'VENDA_PROD', 'Venda de produção do estabelecimento', '5101', '6101', '00', '102', '99', '99', '1', true)
  on conflict (empresa_id, codigo) do nothing;

  -- Devolução de compra
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  values (p_empresa_id, 'DEVOL_COMPRA', 'Devolução de compra', '5202', '6202', '00', '102', '99', '99', '4', true)
  on conflict (empresa_id, codigo) do nothing;

  -- Remessa para industrialização
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  values (p_empresa_id, 'REM_INDUST', 'Remessa para industrialização', '5901', '6901', '00', '300', '99', '99', false, '1', true)
  on conflict (empresa_id, codigo) do nothing;

  -- Retorno de industrialização
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  values (p_empresa_id, 'RET_INDUST', 'Retorno de industrialização', '5902', '6902', '00', '300', '99', '99', false, '1', true)
  on conflict (empresa_id, codigo) do nothing;

  -- Remessa para beneficiamento
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  values (p_empresa_id, 'REM_BENEF', 'Remessa para beneficiamento', '5924', '6924', '00', '300', '99', '99', false, '1', true)
  on conflict (empresa_id, codigo) do nothing;

  -- Retorno e cobrança
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  values (p_empresa_id, 'RET_COBR', 'Retorno e cobrança', '5124', '6124', '00', '102', '99', '99', '1', true)
  on conflict (empresa_id, codigo) do nothing;

  -- Transferência
  insert into public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  values (p_empresa_id, 'TRANSFER', 'Transferência', '5152', '6152', '00', '300', '99', '99', false, '1', true)
  on conflict (empresa_id, codigo) do nothing;
end;
$$;

revoke all on function public.fiscal_naturezas_operacao_seed_defaults(uuid) from public, anon;
grant execute on function public.fiscal_naturezas_operacao_seed_defaults(uuid) to authenticated, service_role;

-- Seed para todas as empresas existentes
do $$
declare
  r record;
begin
  for r in select id from public.empresas loop
    perform public.fiscal_naturezas_operacao_seed_defaults(r.id);
  end loop;
end;
$$;


-- =========================================================
-- 5. Atualizar fiscal_nfe_emissao_draft_upsert para aceitar todos os novos campos
-- =========================================================
-- Recriar a RPC com novos parâmetros (mantém backward compat — todos nullable/com default)
drop function if exists public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb);
drop function if exists public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid);
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
  p_modalidade_frete        text    default '9'
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
      transportadora_id, modalidade_frete
    ) values (
      v_empresa, 'rascunho', v_ambiente,
      p_destinatario_pessoa_id,
      v_nat_op, v_nat_op_id,
      v_frete, p_payload,
      p_forma_pagamento, p_condicao_pagamento_id,
      p_transportadora_id, coalesce(p_modalidade_frete, '9')
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

revoke all on function public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text) from public, anon;
grant execute on function public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text) to authenticated, service_role;


-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
