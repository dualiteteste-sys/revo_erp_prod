/*
  FIN-DRE-01 (P1) DRE (Brasil) — mapeamento + relatório v1 (base em movimentações)

  Objetivo
  - Criar base auditável para um DRE “estado da arte”:
    - mapeamento por empresa: categoria de movimentação → linha do DRE
    - relatório v1: agregação por linha + subtotais calculados, com “não mapeado”

  Notas
  - RPC-first (frontend não acessa tabelas diretamente).
  - Multi-tenant: sempre por `current_empresa_id()` + RLS (fail-closed).
  - Este lote não implementa drill-down paginado nem export (virão em lotes seguintes).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabela: mapeamento de categorias → linha DRE (por empresa)
-- -----------------------------------------------------------------------------

create table if not exists public.financeiro_dre_mapeamentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.current_empresa_id(),
  origem_tipo      text not null default 'mov_categoria'
    check (origem_tipo in ('mov_categoria')),
  origem_valor     text not null,
  dre_linha_key    text not null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  constraint fin_dre_map_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_dre_map_empresa_origem_uk
    unique (empresa_id, origem_tipo, origem_valor)
);

create index if not exists idx_fin_dre_map_empresa
  on public.financeiro_dre_mapeamentos (empresa_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_financeiro_dre_mapeamentos'
      and tgrelid = 'public.financeiro_dre_mapeamentos'::regclass
  ) then
    create trigger handle_updated_at_financeiro_dre_mapeamentos
      before update on public.financeiro_dre_mapeamentos
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.financeiro_dre_mapeamentos enable row level security;

drop policy if exists fin_dre_map_select on public.financeiro_dre_mapeamentos;
drop policy if exists fin_dre_map_insert on public.financeiro_dre_mapeamentos;
drop policy if exists fin_dre_map_update on public.financeiro_dre_mapeamentos;
drop policy if exists fin_dre_map_delete on public.financeiro_dre_mapeamentos;

create policy fin_dre_map_select
  on public.financeiro_dre_mapeamentos
  for select
  using (empresa_id = public.current_empresa_id());

create policy fin_dre_map_insert
  on public.financeiro_dre_mapeamentos
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy fin_dre_map_update
  on public.financeiro_dre_mapeamentos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy fin_dre_map_delete
  on public.financeiro_dre_mapeamentos
  for delete
  using (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- 2) RPCs: listar/salvar/deletar mapeamentos (v1)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_dre_mapeamentos_list_v1();
create or replace function public.financeiro_dre_mapeamentos_list_v1()
returns table (
  id uuid,
  origem_tipo text,
  origem_valor text,
  dre_linha_key text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select m.id, m.origem_tipo, m.origem_valor, m.dre_linha_key, m.created_at, m.updated_at
  from public.financeiro_dre_mapeamentos m
  where m.empresa_id = public.current_empresa_id()
    and (public.require_permission_for_current_user('relatorios_financeiro','view') is null)
  order by m.origem_tipo asc, m.origem_valor asc;
$$;

revoke all on function public.financeiro_dre_mapeamentos_list_v1() from public;
grant execute on function public.financeiro_dre_mapeamentos_list_v1() to authenticated, service_role;

drop function if exists public.financeiro_dre_mapeamentos_set_v1(text, text, text);
create or replace function public.financeiro_dre_mapeamentos_set_v1(
  p_origem_tipo text,
  p_origem_valor text,
  p_dre_linha_key text
)
returns table (
  id uuid,
  origem_tipo text,
  origem_valor text,
  dre_linha_key text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_origem_tipo text := coalesce(nullif(btrim(p_origem_tipo), ''), 'mov_categoria');
  v_origem_valor text := nullif(btrim(p_origem_valor), '');
  v_dre_key text := nullif(btrim(p_dre_linha_key), '');
  v_allowed_keys text[] := array[
    'receita_bruta',
    'deducoes_impostos',
    'cmv_cpv_csp',
    'despesas_operacionais_adm',
    'despesas_operacionais_comerciais',
    'despesas_operacionais_gerais',
    'depreciacao_amortizacao',
    'resultado_financeiro',
    'outras_receitas_despesas',
    'irpj_csll'
  ];
begin
  if v_empresa is null then
    raise exception '[FIN][DRE] empresa_id inválido' using errcode = '42501';
  end if;

  perform public.require_permission_for_current_user('relatorios_financeiro','view');

  if v_origem_tipo <> 'mov_categoria' then
    raise exception 'origem_tipo inválido (esperado: mov_categoria)';
  end if;

  if v_origem_valor is null then
    raise exception 'origem_valor é obrigatório';
  end if;

  if v_dre_key is null or not (v_dre_key = any(v_allowed_keys)) then
    raise exception 'dre_linha_key inválida';
  end if;

  insert into public.financeiro_dre_mapeamentos (empresa_id, origem_tipo, origem_valor, dre_linha_key)
  values (v_empresa, v_origem_tipo, v_origem_valor, v_dre_key)
  on conflict (empresa_id, origem_tipo, origem_valor)
  do update set dre_linha_key = excluded.dre_linha_key, updated_at = now()
  returning
    public.financeiro_dre_mapeamentos.id,
    public.financeiro_dre_mapeamentos.origem_tipo,
    public.financeiro_dre_mapeamentos.origem_valor,
    public.financeiro_dre_mapeamentos.dre_linha_key,
    public.financeiro_dre_mapeamentos.created_at,
    public.financeiro_dre_mapeamentos.updated_at
  into id, origem_tipo, origem_valor, dre_linha_key, created_at, updated_at;

  return next;
end;
$$;

revoke all on function public.financeiro_dre_mapeamentos_set_v1(text, text, text) from public;
grant execute on function public.financeiro_dre_mapeamentos_set_v1(text, text, text) to authenticated, service_role;

drop function if exists public.financeiro_dre_mapeamentos_delete_v1(uuid);
create or replace function public.financeiro_dre_mapeamentos_delete_v1(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if v_empresa is null then
    raise exception '[FIN][DRE] empresa_id inválido' using errcode = '42501';
  end if;

  perform public.require_permission_for_current_user('relatorios_financeiro','view');

  delete from public.financeiro_dre_mapeamentos m
  where m.id = p_id
    and m.empresa_id = v_empresa;
end;
$$;

revoke all on function public.financeiro_dre_mapeamentos_delete_v1(uuid) from public;
grant execute on function public.financeiro_dre_mapeamentos_delete_v1(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) RPC: categorias não mapeadas no período (v1)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_dre_unmapped_categorias_v1(date, date, text, uuid);
create or replace function public.financeiro_dre_unmapped_categorias_v1(
  p_start_date date default null,
  p_end_date date default null,
  p_regime text default 'competencia',
  p_centro_de_custo_id uuid default null
)
returns table (
  categoria text,
  entradas numeric,
  saidas numeric,
  resultado numeric,
  n_lancamentos bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_start date := coalesce(p_start_date, date_trunc('month', current_date)::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
  v_regime text := coalesce(nullif(btrim(p_regime), ''), 'competencia');
begin
  if v_empresa is null then
    raise exception '[FIN][DRE] empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  if v_regime not in ('competencia','caixa') then
    raise exception 'regime inválido (esperado: competencia|caixa)';
  end if;

  perform public.require_permission_for_current_user('relatorios_financeiro','view');
  perform public._fin04_assert_centro_de_custo(p_centro_de_custo_id);

  return query
  with base as (
    select
      coalesce(nullif(btrim(m.categoria), ''), 'Sem categoria') as categoria_norm,
      m.tipo_mov,
      m.valor
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and (
        case when v_regime = 'caixa'
          then m.data_movimento
          else coalesce(m.data_competencia, m.data_movimento)
        end
      ) between v_start and v_end
      and (p_centro_de_custo_id is null or m.centro_de_custo_id = p_centro_de_custo_id)
  ),
  grouped as (
    select
      b.categoria_norm as categoria,
      sum(case when b.tipo_mov = 'entrada' then b.valor else 0 end) as entradas,
      sum(case when b.tipo_mov = 'saida' then b.valor else 0 end) as saidas,
      sum(case when b.tipo_mov = 'entrada' then b.valor else -b.valor end) as resultado,
      count(*) as n_lancamentos
    from base b
    group by 1
  )
  select
    g.categoria,
    g.entradas,
    g.saidas,
    g.resultado,
    g.n_lancamentos
  from grouped g
  left join public.financeiro_dre_mapeamentos map
    on map.empresa_id = v_empresa
   and map.origem_tipo = 'mov_categoria'
   and map.origem_valor = g.categoria
  where map.id is null
  order by abs(g.resultado) desc, g.categoria asc;
end;
$$;

revoke all on function public.financeiro_dre_unmapped_categorias_v1(date, date, text, uuid) from public;
grant execute on function public.financeiro_dre_unmapped_categorias_v1(date, date, text, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RPC: relatório DRE por linha (v1, sem drill-down)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_dre_report_v1(date, date, text, uuid);
create or replace function public.financeiro_dre_report_v1(
  p_start_date date default null,
  p_end_date date default null,
  p_regime text default 'competencia',
  p_centro_de_custo_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_start date := coalesce(p_start_date, date_trunc('month', current_date)::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
  v_regime text := coalesce(nullif(btrim(p_regime), ''), 'competencia');

  v_receita_bruta numeric := 0;
  v_deducoes numeric := 0;
  v_cmv numeric := 0;
  v_desp_adm numeric := 0;
  v_desp_com numeric := 0;
  v_desp_ger numeric := 0;
  v_depr numeric := 0;
  v_fin numeric := 0;
  v_outras numeric := 0;
  v_ir numeric := 0;
  v_unmapped numeric := 0;

  v_receita_liquida numeric := 0;
  v_lucro_bruto numeric := 0;
  v_ebitda numeric := 0;
  v_resultado_operacional numeric := 0;
  v_resultado_antes_ir numeric := 0;
  v_lucro_liquido numeric := 0;
begin
  if v_empresa is null then
    raise exception '[FIN][DRE] empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  if v_regime not in ('competencia','caixa') then
    raise exception 'regime inválido (esperado: competencia|caixa)';
  end if;

  perform public.require_permission_for_current_user('relatorios_financeiro','view');
  perform public._fin04_assert_centro_de_custo(p_centro_de_custo_id);

  with base as (
    select
      coalesce(nullif(btrim(m.categoria), ''), 'Sem categoria') as categoria_norm,
      m.tipo_mov,
      m.valor
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and (
        case when v_regime = 'caixa'
          then m.data_movimento
          else coalesce(m.data_competencia, m.data_movimento)
        end
      ) between v_start and v_end
      and (p_centro_de_custo_id is null or m.centro_de_custo_id = p_centro_de_custo_id)
  ),
  signed as (
    select
      b.categoria_norm,
      case when b.tipo_mov = 'entrada' then b.valor else -b.valor end as signed_valor
    from base b
  ),
  mapped as (
    select
      coalesce(map.dre_linha_key, 'unmapped') as dre_key,
      sum(s.signed_valor) as total
    from signed s
    left join public.financeiro_dre_mapeamentos map
      on map.empresa_id = v_empresa
     and map.origem_tipo = 'mov_categoria'
     and map.origem_valor = s.categoria_norm
    group by 1
  )
  select
    coalesce(sum(case when dre_key = 'receita_bruta' then total end), 0),
    coalesce(sum(case when dre_key = 'deducoes_impostos' then total end), 0),
    coalesce(sum(case when dre_key = 'cmv_cpv_csp' then total end), 0),
    coalesce(sum(case when dre_key = 'despesas_operacionais_adm' then total end), 0),
    coalesce(sum(case when dre_key = 'despesas_operacionais_comerciais' then total end), 0),
    coalesce(sum(case when dre_key = 'despesas_operacionais_gerais' then total end), 0),
    coalesce(sum(case when dre_key = 'depreciacao_amortizacao' then total end), 0),
    coalesce(sum(case when dre_key = 'resultado_financeiro' then total end), 0),
    coalesce(sum(case when dre_key = 'outras_receitas_despesas' then total end), 0),
    coalesce(sum(case when dre_key = 'irpj_csll' then total end), 0),
    coalesce(sum(case when dre_key = 'unmapped' then total end), 0)
  into
    v_receita_bruta,
    v_deducoes,
    v_cmv,
    v_desp_adm,
    v_desp_com,
    v_desp_ger,
    v_depr,
    v_fin,
    v_outras,
    v_ir,
    v_unmapped;

  v_receita_liquida := v_receita_bruta + v_deducoes;
  v_lucro_bruto := v_receita_liquida + v_cmv;
  v_ebitda := v_lucro_bruto + v_desp_adm + v_desp_com + v_desp_ger;
  v_resultado_operacional := v_ebitda + v_depr;
  v_resultado_antes_ir := v_resultado_operacional + v_fin + v_outras;
  v_lucro_liquido := v_resultado_antes_ir + v_ir;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'start_date', v_start,
      'end_date', v_end,
      'regime', v_regime,
      'centro_de_custo_id', p_centro_de_custo_id
    ),
    'linhas', jsonb_build_object(
      'receita_bruta', v_receita_bruta,
      'deducoes_impostos', v_deducoes,
      'receita_liquida', v_receita_liquida,
      'cmv_cpv_csp', v_cmv,
      'lucro_bruto', v_lucro_bruto,
      'despesas_operacionais_adm', v_desp_adm,
      'despesas_operacionais_comerciais', v_desp_com,
      'despesas_operacionais_gerais', v_desp_ger,
      'ebitda', v_ebitda,
      'depreciacao_amortizacao', v_depr,
      'resultado_operacional', v_resultado_operacional,
      'resultado_financeiro', v_fin,
      'outras_receitas_despesas', v_outras,
      'resultado_antes_irpj_csll', v_resultado_antes_ir,
      'irpj_csll', v_ir,
      'lucro_liquido', v_lucro_liquido,
      'unmapped', v_unmapped
    )
  );
end;
$$;

revoke all on function public.financeiro_dre_report_v1(date, date, text, uuid) from public;
grant execute on function public.financeiro_dre_report_v1(date, date, text, uuid) to authenticated, service_role;

commit;

