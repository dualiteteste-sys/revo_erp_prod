/*
  # RH - Dashboard RPC

  ## Query Description
  Cria uma função RPC para agregar estatísticas do módulo de RH para o dashboard.
  Calcula totais de colaboradores, cargos, gaps de competência e status de treinamentos.

  ## Impact Summary
  - Segurança:
    - SECURITY DEFINER com search_path restrito.
    - Escopo sempre limitado à empresa atual via current_empresa_id e filtros explícitos de empresa_id.
  - Performance:
    - Agregação feita no banco de dados para evitar tráfego excessivo de dados.
*/

create or replace function public.get_rh_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id               uuid   := public.current_empresa_id();
  v_total_colaboradores      int;
  v_total_cargos             int;
  v_gaps_identificados       int;
  v_treinamentos_concluidos  int;
  v_investimento_treinamento numeric;
  v_top_gaps                 jsonb;
  v_status_treinamentos      jsonb;
begin
  -- 1. Total de Colaboradores Ativos
  select count(*)
  into v_total_colaboradores
  from public.rh_colaboradores c
  where c.empresa_id = v_empresa_id
    and c.ativo = true;

  -- 2. Total de Cargos Ativos
  select count(*)
  into v_total_cargos
  from public.rh_cargos cg
  where cg.empresa_id = v_empresa_id
    and cg.ativo = true;

  -- 3. Gaps Identificados (Nível Atual < Nível Requerido)
  -- Considera apenas colaboradores ativos e competências obrigatórias
  select count(*)
  into v_gaps_identificados
  from public.rh_colaboradores c
  join public.rh_cargo_competencias req
    on c.cargo_id   = req.cargo_id
   and req.empresa_id = v_empresa_id
  left join public.rh_colaborador_competencias aval
    on aval.colaborador_id  = c.id
   and aval.competencia_id  = req.competencia_id
   and aval.empresa_id      = v_empresa_id
  where c.empresa_id = v_empresa_id
    and c.ativo      = true
    and req.obrigatorio = true
    and coalesce(aval.nivel_atual, 0) < req.nivel_requerido;

  -- 4. Treinamentos Concluídos e Investimento
  select count(*), coalesce(sum(t.custo_real), 0)
  into v_treinamentos_concluidos, v_investimento_treinamento
  from public.rh_treinamentos t
  where t.empresa_id = v_empresa_id
    and t.status     = 'concluido';

  -- 5. Top 5 Competências com mais Gaps
  select jsonb_agg(t)
  into v_top_gaps
  from (
    select comp.nome, count(*) as total_gaps
    from public.rh_colaboradores c
    join public.rh_cargo_competencias req
      on c.cargo_id   = req.cargo_id
     and req.empresa_id = v_empresa_id
    left join public.rh_colaborador_competencias aval
      on aval.colaborador_id  = c.id
     and aval.competencia_id  = req.competencia_id
     and aval.empresa_id      = v_empresa_id
    join public.rh_competencias comp
      on comp.id         = req.competencia_id
     and comp.empresa_id = v_empresa_id
    where c.empresa_id = v_empresa_id
      and c.ativo      = true
      and req.obrigatorio = true
      and coalesce(aval.nivel_atual, 0) < req.nivel_requerido
    group by comp.nome
    order by total_gaps desc
    limit 5
  ) t;

  -- 6. Status dos Treinamentos
  select jsonb_agg(t)
  into v_status_treinamentos
  from (
    select t.status, count(*) as total
    from public.rh_treinamentos t
    where t.empresa_id = v_empresa_id
    group by t.status
  ) t;

  perform pg_notify(
    'app_log',
    '[RPC] get_rh_dashboard_stats: empresa=' || coalesce(v_empresa_id::text, 'null')
  );

  return jsonb_build_object(
    'total_colaboradores',       v_total_colaboradores,
    'total_cargos',              v_total_cargos,
    'gaps_identificados',        v_gaps_identificados,
    'treinamentos_concluidos',   v_treinamentos_concluidos,
    'investimento_treinamento',  v_investimento_treinamento,
    'top_gaps',                  coalesce(v_top_gaps, '[]'::jsonb),
    'status_treinamentos',       coalesce(v_status_treinamentos, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_rh_dashboard_stats from public;
grant execute on function public.get_rh_dashboard_stats to authenticated, service_role;
