/*
  # RH - Seed Data RPC

  ## Query Description
  Cria uma função RPC para popular o módulo de RH com dados fictícios (Cargos, Competências, Colaboradores, Treinamentos).
  Útil para demonstração e testes do dashboard.

  ## Impact Summary
  - Segurança:
    - SECURITY DEFINER com search_path restrito.
    - Apenas insere dados na empresa atual.
    - Aborta se já existirem dados relevantes (cargos/competências/colaboradores/treinamentos) para evitar sujeira.
*/

create or replace function public.seed_rh_module()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  
  -- IDs gerados
  v_cargo_dev      uuid;
  v_cargo_lead     uuid;
  v_cargo_analista uuid;
  
  v_comp_react      uuid;
  v_comp_node       uuid;
  v_comp_lideranca  uuid;
  v_comp_ingles     uuid;
  v_comp_iso        uuid;
  
  v_colab_joao   uuid;
  v_colab_maria  uuid;
  v_colab_pedro  uuid;
  
  v_treino_id uuid;
begin
  /*
    1. Guard de segurança / idempotência:
       - só executa se NÃO houver dados de RH já cadastrados para a empresa.
       - evita conflitos com UNIQUE (empresa_id, nome) e preserva dados reais.
  */
  if exists (select 1 from public.rh_cargos        where empresa_id = v_empresa_id)
     or exists (select 1 from public.rh_competencias   where empresa_id = v_empresa_id)
     or exists (select 1 from public.rh_colaboradores  where empresa_id = v_empresa_id)
     or exists (select 1 from public.rh_treinamentos   where empresa_id = v_empresa_id)
  then
    return;
  end if;

  -- 2. Criar Competências (seed básico)
  insert into public.rh_competencias (empresa_id, nome, tipo, descricao, critico_sgq)
    values (v_empresa_id, 'React / Frontend', 'tecnica', 'Desenvolvimento de interfaces com React.', true)
    returning id into v_comp_react;

  insert into public.rh_competencias (empresa_id, nome, tipo, descricao, critico_sgq)
    values (v_empresa_id, 'Node.js / Backend', 'tecnica', 'APIs REST, banco de dados e arquitetura.', true)
    returning id into v_comp_node;

  insert into public.rh_competencias (empresa_id, nome, tipo, descricao, critico_sgq)
    values (v_empresa_id, 'Liderança', 'comportamental', 'Gestão de pessoas, feedbacks e motivação.', true)
    returning id into v_comp_lideranca;

  insert into public.rh_competencias (empresa_id, nome, tipo, descricao, critico_sgq)
    values (v_empresa_id, 'Inglês', 'idioma', 'Comunicação escrita e verbal em inglês.', false)
    returning id into v_comp_ingles;

  insert into public.rh_competencias (empresa_id, nome, tipo, descricao, critico_sgq)
    values (v_empresa_id, 'ISO 9001', 'certificacao', 'Conhecimento da norma e auditoria.', true)
    returning id into v_comp_iso;

  -- 3. Criar Cargos
  insert into public.rh_cargos (empresa_id, nome, setor, descricao) 
    values (v_empresa_id, 'Desenvolvedor Full-Stack', 'Tecnologia', 'Atua no front e back-end.') 
    returning id into v_cargo_dev;

  insert into public.rh_cargos (empresa_id, nome, setor, descricao) 
    values (v_empresa_id, 'Tech Lead', 'Tecnologia', 'Liderança técnica do time.') 
    returning id into v_cargo_lead;

  insert into public.rh_cargos (empresa_id, nome, setor, descricao) 
    values (v_empresa_id, 'Analista de Qualidade', 'Qualidade', 'Gestão do SGQ e processos.') 
    returning id into v_cargo_analista;

  -- 4. Vincular Competências aos Cargos (Requisitos)
  -- Dev: React (4), Node (4), Inglês (3)
  insert into public.rh_cargo_competencias (empresa_id, cargo_id, competencia_id, nivel_requerido, obrigatorio) values
    (v_empresa_id, v_cargo_dev,   v_comp_react,     4, true),
    (v_empresa_id, v_cargo_dev,   v_comp_node,      4, true),
    (v_empresa_id, v_cargo_dev,   v_comp_ingles,    3, false);

  -- Tech Lead: React (5), Node (5), Liderança (4)
  insert into public.rh_cargo_competencias (empresa_id, cargo_id, competencia_id, nivel_requerido, obrigatorio) values
    (v_empresa_id, v_cargo_lead,  v_comp_react,      5, true),
    (v_empresa_id, v_cargo_lead,  v_comp_node,       5, true),
    (v_empresa_id, v_cargo_lead,  v_comp_lideranca,  4, true);

  -- Analista: ISO (5), Inglês (3)
  insert into public.rh_cargo_competencias (empresa_id, cargo_id, competencia_id, nivel_requerido, obrigatorio) values
    (v_empresa_id, v_cargo_analista, v_comp_iso,    5, true),
    (v_empresa_id, v_cargo_analista, v_comp_ingles, 3, false);

  -- 5. Criar Colaboradores
  insert into public.rh_colaboradores (empresa_id, nome, email, cargo_id, data_admissao, ativo)
    values (v_empresa_id, 'João Silva',  'joao@demo.com',  v_cargo_dev,      current_date - interval '2 year', true)
    returning id into v_colab_joao;

  insert into public.rh_colaboradores (empresa_id, nome, email, cargo_id, data_admissao, ativo)
    values (v_empresa_id, 'Maria Souza', 'maria@demo.com', v_cargo_lead,     current_date - interval '5 year', true)
    returning id into v_colab_maria;

  insert into public.rh_colaboradores (empresa_id, nome, email, cargo_id, data_admissao, ativo)
    values (v_empresa_id, 'Pedro Santos','pedro@demo.com', v_cargo_analista, current_date - interval '1 year', true)
    returning id into v_colab_pedro;

  -- 6. Avaliações de Competência (Gerar Gaps)
  -- João (Dev): React 3 (Gap -1), Node 4 (OK)
  insert into public.rh_colaborador_competencias (empresa_id, colaborador_id, competencia_id, nivel_atual, data_avaliacao)
    values
      (v_empresa_id, v_colab_joao,  v_comp_react, 3, current_date),
      (v_empresa_id, v_colab_joao,  v_comp_node,  4, current_date);

  -- Maria (Lead): React 5 (OK), Liderança 3 (Gap -1)
  insert into public.rh_colaborador_competencias (empresa_id, colaborador_id, competencia_id, nivel_atual, data_avaliacao)
    values
      (v_empresa_id, v_colab_maria, v_comp_react,     5, current_date),
      (v_empresa_id, v_colab_maria, v_comp_lideranca, 3, current_date);

  -- Pedro (Analista): ISO 5 (OK)
  insert into public.rh_colaborador_competencias (empresa_id, colaborador_id, competencia_id, nivel_atual, data_avaliacao)
    values
      (v_empresa_id, v_colab_pedro, v_comp_iso, 5, current_date);

  -- 7. Treinamentos
  insert into public.rh_treinamentos (empresa_id, nome, tipo, status, data_inicio, instrutor, objetivo)
    values (
      v_empresa_id,
      'Workshop React Avançado',
      'interno',
      'concluido',
      current_date - interval '1 month',
      'Tech Lead',
      'Melhorar performance em front-end.'
    )
    returning id into v_treino_id;

  -- Inscrever João no treinamento (concluído)
  insert into public.rh_treinamento_participantes (
    empresa_id, treinamento_id, colaborador_id, status, nota_final, eficacia_avaliada
  ) values (
    v_empresa_id, v_treino_id, v_colab_joao, 'concluido', 9.5, true
  );

  -- Treinamento planejado de Liderança
  insert into public.rh_treinamentos (empresa_id, nome, tipo, status, data_inicio, instrutor, objetivo)
    values (
      v_empresa_id,
      'Liderança 360',
      'externo',
      'planejado',
      current_date + interval '1 month',
      'Consultoria RH',
      'Desenvolver soft skills de liderança.'
    );

  perform pg_notify(
    'app_log',
    '[SEED] seed_rh_module: empresa=' || coalesce(v_empresa_id::text, 'null')
  );
end;
$$;

revoke all on function public.seed_rh_module from public;
grant execute on function public.seed_rh_module to authenticated, service_role;
