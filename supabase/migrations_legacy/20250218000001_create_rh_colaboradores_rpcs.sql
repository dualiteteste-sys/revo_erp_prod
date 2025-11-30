/*
  # RH - Colaboradores RPCs (versão compatível)

  ## Impact Summary
  - Segurança:
    - SECURITY DEFINER com search_path = pg_catalog, public.
    - RLS ativa nas tabelas base; filtros por empresa_id = public.current_empresa_id().
  - Compatibilidade:
    - Mantida assinatura com p_ativo_only em rh_list_colaboradores.
    - Funções antigas são dropadas pela assinatura exata (Regra 14).
  - Funcionalidade:
    - Listagem de colaboradores com filtro de cargo e ativo.
    - Detalhes com análise de GAP (nível atual x requerido).
    - Upsert de colaborador com:
      - criação/edição de dados básicos;
      - upsert de competências;
      - remoção de avaliações quando nivel_atual <= 0.
*/

-- =============================================
-- 0. Drop funções antigas pela assinatura exata (Regra 14)
-- =============================================

drop function if exists public.rh_list_colaboradores(text, uuid, boolean);
drop function if exists public.rh_get_colaborador_details(uuid);
drop function if exists public.rh_upsert_colaborador(jsonb);

-- =============================================
-- 1. Listar Colaboradores
-- =============================================
create or replace function public.rh_list_colaboradores(
  p_search     text default null,
  p_cargo_id   uuid default null,
  p_ativo_only boolean default false
)
returns table (
  id                          uuid,
  nome                        text,
  email                       text,
  documento                   text,
  data_admissao               date,
  cargo_id                    uuid,
  cargo_nome                  text,
  ativo                       boolean,
  total_competencias_avaliadas bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    c.id,
    c.nome,
    c.email,
    c.documento,
    c.data_admissao,
    c.cargo_id,
    cg.nome as cargo_nome,
    c.ativo,
    (
      select count(*)
      from public.rh_colaborador_competencias cc
      where cc.colaborador_id = c.id
        and cc.empresa_id = v_empresa_id
    ) as total_competencias_avaliadas
  from public.rh_colaboradores c
  left join public.rh_cargos cg
    on c.cargo_id = cg.id
  where c.empresa_id = v_empresa_id
    and (p_search is null
         or c.nome  ilike '%' || p_search || '%'
         or c.email ilike '%' || p_search || '%')
    and (p_cargo_id is null or c.cargo_id = p_cargo_id)
    and (p_ativo_only is false or c.ativo = true)
  order by c.nome;
end;
$$;

revoke all on function public.rh_list_colaboradores from public;
grant execute on function public.rh_list_colaboradores to authenticated, service_role;

-- =============================================
-- 2. Detalhes do Colaborador (com GAP)
-- =============================================
create or replace function public.rh_get_colaborador_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id  uuid := public.current_empresa_id();
  v_colaborador jsonb;
  v_competencias jsonb;
  v_cargo_id    uuid;
begin
  -- Dados básicos do colaborador
  select to_jsonb(c.*) || jsonb_build_object('cargo_nome', cg.nome)
  into v_colaborador
  from public.rh_colaboradores c
  left join public.rh_cargos cg
    on c.cargo_id = cg.id
  where c.id = p_id
    and c.empresa_id = v_empresa_id;

  if v_colaborador is null then
    return null;
  end if;

  v_cargo_id := (v_colaborador->>'cargo_id')::uuid;

  /*
    GAP:
    - req: requisitos por cargo (rh_cargo_competencias)
    - aval: avaliações por colaborador (rh_colaborador_competencias)
    - full join para cobrir:
      - competências requeridas sem avaliação (gap negativo)
      - competências avaliadas sem estar na lista de requisitos
  */
  select jsonb_agg(
           jsonb_build_object(
             'competencia_id', coalesce(req.competencia_id, aval.competencia_id),
             'nome',           comp.nome,
             'tipo',           comp.tipo,
             'nivel_requerido', coalesce(req.nivel_requerido, 0),
             'nivel_atual',     coalesce(aval.nivel_atual, 0),
             'gap',             coalesce(aval.nivel_atual, 0) - coalesce(req.nivel_requerido, 0),
             'obrigatorio',     coalesce(req.obrigatorio, false),
             'data_avaliacao',  aval.data_avaliacao,
             'origem',          aval.origem
           )
           order by comp.nome
         )
  into v_competencias
  from (
    select competencia_id, nivel_requerido, obrigatorio
    from public.rh_cargo_competencias
    where cargo_id = v_cargo_id
      and empresa_id = v_empresa_id
  ) req
  full join (
    select competencia_id, nivel_atual, data_avaliacao, origem
    from public.rh_colaborador_competencias
    where colaborador_id = p_id
      and empresa_id = v_empresa_id
  ) aval
    on req.competencia_id = aval.competencia_id
  join public.rh_competencias comp
    on comp.id = coalesce(req.competencia_id, aval.competencia_id)
   and comp.empresa_id = v_empresa_id;

  return v_colaborador
         || jsonb_build_object('competencias', coalesce(v_competencias, '[]'::jsonb));
end;
$$;

revoke all on function public.rh_get_colaborador_details from public;
grant execute on function public.rh_get_colaborador_details to authenticated, service_role;

-- =============================================
-- 3. Upsert Colaborador (Salvar + Avaliações)
-- =============================================
create or replace function public.rh_upsert_colaborador(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id          uuid;
  v_empresa_id  uuid := public.current_empresa_id();
  v_competencias jsonb;
  v_comp        record;
  v_nivel       int;
begin
  -- Upsert em rh_colaboradores
  if p_payload->>'id' is not null then
    update public.rh_colaboradores
    set
      nome         = p_payload->>'nome',
      email        = p_payload->>'email',
      documento    = p_payload->>'documento',
      data_admissao = (p_payload->>'data_admissao')::date,
      cargo_id     = (p_payload->>'cargo_id')::uuid,
      ativo        = coalesce((p_payload->>'ativo')::boolean, true)
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.rh_colaboradores (
      empresa_id, nome, email, documento, data_admissao, cargo_id, ativo
    ) values (
      v_empresa_id,
      p_payload->>'nome',
      p_payload->>'email',
      p_payload->>'documento',
      (p_payload->>'data_admissao')::date,
      (p_payload->>'cargo_id')::uuid,
      coalesce((p_payload->>'ativo')::boolean, true)
    )
    returning id into v_id;
  end if;

  -- Upsert de competências (avaliações)
  v_competencias := p_payload->'competencias';

  if v_competencias is not null then
    for v_comp in
      select * from jsonb_array_elements(v_competencias)
    loop
      v_nivel := coalesce((v_comp.value->>'nivel_atual')::int, 0);

      if v_nivel > 0 then
        -- Insere ou atualiza avaliação
        insert into public.rh_colaborador_competencias (
          empresa_id, colaborador_id, competencia_id, nivel_atual, data_avaliacao, origem
        ) values (
          v_empresa_id,
          v_id,
          (v_comp.value->>'competencia_id')::uuid,
          v_nivel,
          coalesce((v_comp.value->>'data_avaliacao')::date, current_date),
          v_comp.value->>'origem'
        )
        on conflict (empresa_id, colaborador_id, competencia_id) do update
        set
          nivel_atual    = excluded.nivel_atual,
          data_avaliacao = excluded.data_avaliacao,
          origem         = excluded.origem;
      else
        -- Nível 0 ou nulo => limpar avaliação
        delete from public.rh_colaborador_competencias
        where empresa_id     = v_empresa_id
          and colaborador_id = v_id
          and competencia_id = (v_comp.value->>'competencia_id')::uuid;
      end if;
    end loop;
  end if;

  perform pg_notify('app_log', '[RPC] rh_upsert_colaborador: ' || v_id);
  return public.rh_get_colaborador_details(v_id);
end;
$$;

revoke all on function public.rh_upsert_colaborador from public;
grant execute on function public.rh_upsert_colaborador to authenticated, service_role;
