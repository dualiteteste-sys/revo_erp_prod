/*
  # RH - Matriz de Competências RPC
  ## Query Description
  Cria uma função otimizada para buscar dados da matriz de competências.
  Retorna uma lista de colaboradores, cada um com suas competências (requeridas pelo cargo + avaliadas).
  ## Impact Summary
  - Segurança: SECURITY DEFINER, search_path controlado, RLS via filtro de empresa_id.
  - Performance: Realiza joins e agregações no banco para evitar N+1 no frontend.
  - Funcionalidade: Permite filtrar por cargo para facilitar a visualização.
*/

create or replace function public.rh_get_competency_matrix(
  p_cargo_id uuid default null
)
returns table (
  colaborador_id uuid,
  colaborador_nome text,
  cargo_nome text,
  competencias jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  with colabs as (
    select 
      c.id, 
      c.nome, 
      c.cargo_id,
      cg.nome as cargo_nome
    from public.rh_colaboradores c
    left join public.rh_cargos cg on c.cargo_id = cg.id
    where c.empresa_id = v_empresa_id
    and c.ativo = true
    and (p_cargo_id is null or c.cargo_id = p_cargo_id)
  ),
  -- Competências requeridas pelo cargo
  reqs as (
    select 
      cc.cargo_id,
      cc.competencia_id,
      cc.nivel_requerido,
      cc.obrigatorio
    from public.rh_cargo_competencias cc
    where cc.empresa_id = v_empresa_id
  ),
  -- Avaliações atuais dos colaboradores
  avals as (
    select 
      rcc.colaborador_id,
      rcc.competencia_id,
      rcc.nivel_atual
    from public.rh_colaborador_competencias rcc
    where rcc.empresa_id = v_empresa_id
  ),
  -- Lista unificada de todas as competências relevantes para cada colaborador
  -- (Seja porque o cargo exige, ou porque ele tem avaliação)
  matrix_data as (
    select
      c.id as colaborador_id,
      comp.id as competencia_id,
      comp.nome as competencia_nome,
      comp.tipo as competencia_tipo,
      coalesce(r.nivel_requerido, 0) as nivel_requerido,
      coalesce(a.nivel_atual, 0) as nivel_atual,
      (coalesce(a.nivel_atual, 0) - coalesce(r.nivel_requerido, 0)) as gap,
      coalesce(r.obrigatorio, false) as obrigatorio
    from colabs c
    cross join public.rh_competencias comp
    left join reqs r on r.cargo_id = c.cargo_id and r.competencia_id = comp.id
    left join avals a on a.colaborador_id = c.id and a.competencia_id = comp.id
    where comp.empresa_id = v_empresa_id
    -- Filtra apenas competências que são requeridas OU avaliadas para este colaborador
    -- Para não trazer produto cartesiano gigante de competências irrelevantes
    and (r.competencia_id is not null or a.competencia_id is not null)
  )
  select
    c.id as colaborador_id,
    c.nome as colaborador_nome,
    c.cargo_nome,
    jsonb_agg(
      jsonb_build_object(
        'id', md.competencia_id,
        'nome', md.competencia_nome,
        'tipo', md.competencia_tipo,
        'nivel_requerido', md.nivel_requerido,
        'nivel_atual', md.nivel_atual,
        'gap', md.gap,
        'obrigatorio', md.obrigatorio
      ) order by md.competencia_nome
    ) as competencias
  from colabs c
  join matrix_data md on md.colaborador_id = c.id
  group by c.id, c.nome, c.cargo_nome
  order by c.nome;
end;
$$;

revoke all on function public.rh_get_competency_matrix from public;
grant execute on function public.rh_get_competency_matrix to authenticated, service_role;
