/*
  Align PROD tables for RPCs (hotfix)

  Problema
  - Em ambientes antigos, algumas tabelas foram criadas com menos colunas.
  - Migrations antigas usavam `CREATE TABLE IF NOT EXISTS`, que não adiciona colunas em tabelas já existentes.
  - RPCs atuais (`compras_list_pedidos`, `financeiro_relatorio_por_centro_custo`) referenciam colunas que podem não existir,
    causando HTTP 400 no PostgREST (ex.: "column ... does not exist").

  O que faz
  - Adiciona colunas faltantes (idempotente) nas tabelas usadas pelas RPCs.
  - Recria as RPCs para garantir a versão esperada e recarrega o schema cache do PostgREST.

  Reversibilidade
  - Não remove colunas; apenas adiciona (mudança aditiva). Para “desfazer”, seria necessário uma migration destrutiva (não recomendado).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Suprimentos / Compras: garantir colunas esperadas em compras_pedidos
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.compras_pedidos') is null then
    raise notice 'align: public.compras_pedidos não existe; pulando.';
  else
    -- colunas básicas
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='empresa_id'
    ) then
      alter table public.compras_pedidos add column empresa_id uuid;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='numero'
    ) then
      alter table public.compras_pedidos add column numero bigint;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='fornecedor_id'
    ) then
      alter table public.compras_pedidos add column fornecedor_id uuid;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='status'
    ) then
      alter table public.compras_pedidos add column status text default 'rascunho';
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='data_emissao'
    ) then
      alter table public.compras_pedidos add column data_emissao date default current_date;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='data_prevista'
    ) then
      alter table public.compras_pedidos add column data_prevista date;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='data_recebimento'
    ) then
      alter table public.compras_pedidos add column data_recebimento date;
    end if;

    -- totais (o front e as RPCs atuais esperam estes campos)
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='total_produtos'
    ) then
      alter table public.compras_pedidos add column total_produtos numeric(14,2) not null default 0;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='frete'
    ) then
      alter table public.compras_pedidos add column frete numeric(14,2) not null default 0;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='desconto'
    ) then
      alter table public.compras_pedidos add column desconto numeric(14,2) not null default 0;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='total_geral'
    ) then
      alter table public.compras_pedidos add column total_geral numeric(14,2) not null default 0;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='observacoes'
    ) then
      alter table public.compras_pedidos add column observacoes text;
    end if;

    -- timestamps
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='created_at'
    ) then
      alter table public.compras_pedidos add column created_at timestamptz not null default now();
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='compras_pedidos' and column_name='updated_at'
    ) then
      alter table public.compras_pedidos add column updated_at timestamptz not null default now();
    end if;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) Financeiro: garantir centro_de_custo_id onde o relatório usa
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.financeiro_centros_custos') is null then
    raise notice 'align: public.financeiro_centros_custos não existe; pulando FKs.';
  end if;

  if to_regclass('public.contas_a_receber') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='contas_a_receber' and column_name='centro_de_custo_id'
    ) then
      if to_regclass('public.financeiro_centros_custos') is not null then
        alter table public.contas_a_receber
          add column centro_de_custo_id uuid references public.financeiro_centros_custos(id) on delete set null;
      else
        alter table public.contas_a_receber add column centro_de_custo_id uuid;
      end if;
      create index if not exists idx_contas_a_receber_empresa_centro
        on public.contas_a_receber (empresa_id, centro_de_custo_id);
    end if;
  end if;

  if to_regclass('public.financeiro_contas_pagar') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='financeiro_contas_pagar' and column_name='centro_de_custo_id'
    ) then
      if to_regclass('public.financeiro_centros_custos') is not null then
        alter table public.financeiro_contas_pagar
          add column centro_de_custo_id uuid references public.financeiro_centros_custos(id) on delete set null;
      else
        alter table public.financeiro_contas_pagar add column centro_de_custo_id uuid;
      end if;
      create index if not exists idx_fin_cp_empresa_centro
        on public.financeiro_contas_pagar (empresa_id, centro_de_custo_id);
    end if;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Recria as RPCs (mesma versão esperada pelo app)
-- -----------------------------------------------------------------------------

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

drop function if exists public.financeiro_relatorio_por_centro_custo(date, date);
create function public.financeiro_relatorio_por_centro_custo(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  centro_id uuid,
  centro_nome text,
  entradas numeric,
  saidas numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_start date := coalesce(p_start_date, (date_trunc('month', current_date) - interval '5 months')::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
begin
  perform public.require_permission_for_current_user('relatorios_financeiro','view');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  return query
  with receber as (
    select
      c.centro_de_custo_id as centro_id,
      sum(coalesce(c.valor_pago, c.valor))::numeric as entradas
    from public.contas_a_receber c
    where c.empresa_id = v_empresa
      and c.status = 'pago'::public.status_conta_receber
      and c.data_pagamento between v_start and v_end
    group by 1
  ),
  pagar as (
    select
      p.centro_de_custo_id as centro_id,
      sum(coalesce(p.valor_pago, 0))::numeric as saidas
    from public.financeiro_contas_pagar p
    where p.empresa_id = v_empresa
      and p.status = 'paga'
      and p.data_pagamento between v_start and v_end
    group by 1
  ),
  merged as (
    select centro_id, entradas::numeric as entradas, 0::numeric as saidas from receber
    union all
    select centro_id, 0::numeric as entradas, saidas::numeric as saidas from pagar
  )
  select
    m.centro_id,
    case
      when m.centro_id is null then 'Sem centro'
      else coalesce(cc.nome, 'Centro')
    end as centro_nome,
    sum(m.entradas)::numeric as entradas,
    sum(m.saidas)::numeric as saidas
  from merged m
  left join public.financeiro_centros_custos cc
    on cc.id = m.centro_id
   and cc.empresa_id = v_empresa
  group by m.centro_id, centro_nome
  order by (sum(m.entradas) + sum(m.saidas)) desc;
end;
$$;

revoke all on function public.financeiro_relatorio_por_centro_custo(date, date) from public;
grant execute on function public.financeiro_relatorio_por_centro_custo(date, date) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

