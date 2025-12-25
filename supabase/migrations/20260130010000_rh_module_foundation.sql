/*
  RH & Qualidade (foundation)

  Objetivo:
  - Versionar o módulo de RH no banco (tabelas + RLS + triggers + RPCs)
  - Evitar drift entre ambientes (CI "verify migrations on clean database")
  - Manter UI atual funcionando (cargos, competências, colaboradores, matriz, treinamentos)
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table if not exists public.rh_cargos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  responsabilidades text,
  autoridades text,
  setor text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists ux_rh_cargos_empresa_nome on public.rh_cargos (empresa_id, nome);
create index if not exists idx_rh_cargos_empresa_id on public.rh_cargos (empresa_id);

create table if not exists public.rh_competencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  tipo text not null,
  critico_sgq boolean default false,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint rh_competencias_tipo_check
    check (tipo = any (array['tecnica','comportamental','certificacao','idioma','outros']))
);

create unique index if not exists ux_rh_competencias_empresa_nome on public.rh_competencias (empresa_id, nome);
create index if not exists idx_rh_competencias_empresa_id on public.rh_competencias (empresa_id);

create table if not exists public.rh_colaboradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  email text,
  documento text,
  data_admissao date,
  cargo_id uuid references public.rh_cargos(id) on delete set null,
  ativo boolean default true,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rh_colaboradores_empresa_id on public.rh_colaboradores (empresa_id);
create index if not exists idx_rh_colaboradores_cargo_id on public.rh_colaboradores (cargo_id);
create index if not exists idx_rh_colaboradores_user_id on public.rh_colaboradores (user_id);

create table if not exists public.rh_cargo_competencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cargo_id uuid not null references public.rh_cargos(id) on delete cascade,
  competencia_id uuid not null references public.rh_competencias(id) on delete cascade,
  nivel_requerido int default 1,
  obrigatorio boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint rh_cargo_competencias_nivel_requerido_check
    check (nivel_requerido >= 1 and nivel_requerido <= 5)
);

create unique index if not exists ux_rh_cargo_competencias_unique
  on public.rh_cargo_competencias (empresa_id, cargo_id, competencia_id);
create index if not exists idx_rh_cargo_competencias_empresa_id on public.rh_cargo_competencias (empresa_id);
create index if not exists idx_rh_cargo_competencias_cargo_id on public.rh_cargo_competencias (cargo_id);
create index if not exists idx_rh_cargo_competencias_competencia_id on public.rh_cargo_competencias (competencia_id);

create table if not exists public.rh_colaborador_competencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  colaborador_id uuid not null references public.rh_colaboradores(id) on delete cascade,
  competencia_id uuid not null references public.rh_competencias(id) on delete cascade,
  nivel_atual int default 1,
  data_avaliacao date default current_date,
  origem text,
  validade date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint rh_colaborador_competencias_nivel_atual_check
    check (nivel_atual >= 1 and nivel_atual <= 5)
);

create unique index if not exists ux_rh_col_competencias_unique
  on public.rh_colaborador_competencias (empresa_id, colaborador_id, competencia_id);
create index if not exists idx_rh_col_competencias_empresa_id on public.rh_colaborador_competencias (empresa_id);
create index if not exists idx_rh_col_competencias_colaborador_id on public.rh_colaborador_competencias (colaborador_id);
create index if not exists idx_rh_col_competencias_competencia_id on public.rh_colaborador_competencias (competencia_id);

create table if not exists public.rh_treinamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  tipo text not null,
  status text not null default 'planejado',
  data_inicio timestamptz,
  data_fim timestamptz,
  carga_horaria_horas numeric(10,2),
  instrutor text,
  localizacao text,
  custo_estimado numeric(10,2) default 0,
  custo_real numeric(10,2) default 0,
  objetivo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint rh_treinamentos_tipo_check
    check (tipo = any (array['interno','externo','online','on_the_job'])),
  constraint rh_treinamentos_status_check
    check (status = any (array['planejado','agendado','em_andamento','concluido','cancelado']))
);

create index if not exists idx_rh_treinamentos_empresa_id on public.rh_treinamentos (empresa_id);
create index if not exists idx_rh_treinamentos_status on public.rh_treinamentos (empresa_id, status);

create table if not exists public.rh_treinamento_participantes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  treinamento_id uuid not null references public.rh_treinamentos(id) on delete cascade,
  colaborador_id uuid not null references public.rh_colaboradores(id) on delete cascade,
  status text not null default 'inscrito',
  nota_final numeric(5,2),
  certificado_url text,
  comentarios text,
  eficacia_avaliada boolean default false,
  parecer_eficacia text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint rh_treinamento_participantes_status_check
    check (status = any (array['inscrito','confirmado','concluido','reprovado','ausente']))
);

create unique index if not exists ux_rh_treinamento_participantes_unique
  on public.rh_treinamento_participantes (empresa_id, treinamento_id, colaborador_id);
create index if not exists idx_rh_treinamento_part_empresa_id on public.rh_treinamento_participantes (empresa_id);
create index if not exists idx_rh_treinamento_part_treinamento_id on public.rh_treinamento_participantes (treinamento_id);
create index if not exists idx_rh_treinamento_part_colaborador_id on public.rh_treinamento_participantes (colaborador_id);

-- -----------------------------------------------------------------------------
-- RLS + Policies (padrão tenant por empresa)
-- -----------------------------------------------------------------------------

alter table public.rh_cargos enable row level security;
alter table public.rh_competencias enable row level security;
alter table public.rh_colaboradores enable row level security;
alter table public.rh_cargo_competencias enable row level security;
alter table public.rh_colaborador_competencias enable row level security;
alter table public.rh_treinamentos enable row level security;
alter table public.rh_treinamento_participantes enable row level security;

drop policy if exists policy_select on public.rh_cargos;
create policy policy_select on public.rh_cargos
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_insert on public.rh_cargos;
create policy policy_insert on public.rh_cargos
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_update on public.rh_cargos;
create policy policy_update on public.rh_cargos
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_delete on public.rh_cargos;
create policy policy_delete on public.rh_cargos
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_select on public.rh_competencias;
create policy policy_select on public.rh_competencias
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_insert on public.rh_competencias;
create policy policy_insert on public.rh_competencias
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_update on public.rh_competencias;
create policy policy_update on public.rh_competencias
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_delete on public.rh_competencias;
create policy policy_delete on public.rh_competencias
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_select on public.rh_colaboradores;
create policy policy_select on public.rh_colaboradores
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_insert on public.rh_colaboradores;
create policy policy_insert on public.rh_colaboradores
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_update on public.rh_colaboradores;
create policy policy_update on public.rh_colaboradores
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_delete on public.rh_colaboradores;
create policy policy_delete on public.rh_colaboradores
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_select on public.rh_cargo_competencias;
create policy policy_select on public.rh_cargo_competencias
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_insert on public.rh_cargo_competencias;
create policy policy_insert on public.rh_cargo_competencias
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_update on public.rh_cargo_competencias;
create policy policy_update on public.rh_cargo_competencias
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_delete on public.rh_cargo_competencias;
create policy policy_delete on public.rh_cargo_competencias
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_select on public.rh_colaborador_competencias;
create policy policy_select on public.rh_colaborador_competencias
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_insert on public.rh_colaborador_competencias;
create policy policy_insert on public.rh_colaborador_competencias
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_update on public.rh_colaborador_competencias;
create policy policy_update on public.rh_colaborador_competencias
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_delete on public.rh_colaborador_competencias;
create policy policy_delete on public.rh_colaborador_competencias
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_select on public.rh_treinamentos;
create policy policy_select on public.rh_treinamentos
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_insert on public.rh_treinamentos;
create policy policy_insert on public.rh_treinamentos
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_update on public.rh_treinamentos;
create policy policy_update on public.rh_treinamentos
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_delete on public.rh_treinamentos;
create policy policy_delete on public.rh_treinamentos
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_select on public.rh_treinamento_participantes;
create policy policy_select on public.rh_treinamento_participantes
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists policy_insert on public.rh_treinamento_participantes;
create policy policy_insert on public.rh_treinamento_participantes
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_update on public.rh_treinamento_participantes;
create policy policy_update on public.rh_treinamento_participantes
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists policy_delete on public.rh_treinamento_participantes;
create policy policy_delete on public.rh_treinamento_participantes
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- Triggers updated_at (padrão)
-- -----------------------------------------------------------------------------

create or replace trigger handle_updated_at_rh_cargos
  before update on public.rh_cargos
  for each row execute function public.tg_set_updated_at();

create or replace trigger handle_updated_at_rh_competencias
  before update on public.rh_competencias
  for each row execute function public.tg_set_updated_at();

create or replace trigger handle_updated_at_rh_colaboradores
  before update on public.rh_colaboradores
  for each row execute function public.tg_set_updated_at();

create or replace trigger handle_updated_at_rh_cargo_comp
  before update on public.rh_cargo_competencias
  for each row execute function public.tg_set_updated_at();

create or replace trigger handle_updated_at_rh_colab_comp
  before update on public.rh_colaborador_competencias
  for each row execute function public.tg_set_updated_at();

create or replace trigger handle_updated_at_rh_treinamentos
  before update on public.rh_treinamentos
  for each row execute function public.tg_set_updated_at();

create or replace trigger handle_updated_at_rh_treinamento_part
  before update on public.rh_treinamento_participantes
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

create or replace function public.rh_list_cargos(
  p_search text default null,
  p_ativo_only boolean default false
)
returns table (
  id uuid,
  nome text,
  descricao text,
  setor text,
  ativo boolean,
  total_colaboradores bigint,
  total_competencias bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select
    c.id,
    c.nome,
    c.descricao,
    c.setor,
    c.ativo,
    (
      select count(*)
      from public.rh_colaboradores col
      where col.cargo_id = c.id
        and col.empresa_id = public.current_empresa_id()
    ) as total_colaboradores,
    (
      select count(*)
      from public.rh_cargo_competencias cc
      where cc.cargo_id = c.id
        and cc.empresa_id = public.current_empresa_id()
    ) as total_competencias
  from public.rh_cargos c
  where c.empresa_id = public.current_empresa_id()
    and (p_search is null or c.nome ilike '%' || p_search || '%')
    and (p_ativo_only is false or c.ativo = true)
  order by c.nome;
end;
$$;

create or replace function public.rh_list_competencias(
  p_search text default null
)
returns table (
  id uuid,
  nome text,
  tipo text,
  descricao text,
  critico_sgq boolean,
  ativo boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select c.id, c.nome, c.tipo, c.descricao, c.critico_sgq, c.ativo
  from public.rh_competencias c
  where c.empresa_id = public.current_empresa_id()
    and (p_search is null or c.nome ilike '%' || p_search || '%')
  order by c.nome;
end;
$$;

create or replace function public.rh_list_colaboradores(
  p_search text default null,
  p_cargo_id uuid default null,
  p_ativo_only boolean default false
)
returns table (
  id uuid,
  nome text,
  email text,
  documento text,
  data_admissao date,
  cargo_id uuid,
  cargo_nome text,
  ativo boolean,
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
         or c.nome ilike '%' || p_search || '%'
         or c.email ilike '%' || p_search || '%')
    and (p_cargo_id is null or c.cargo_id = p_cargo_id)
    and (p_ativo_only is false or c.ativo = true)
  order by c.nome;
end;
$$;

create or replace function public.rh_get_cargo_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cargo jsonb;
  v_competencias jsonb;
begin
  select to_jsonb(c.*) into v_cargo
  from public.rh_cargos c
  where c.id = p_id
    and c.empresa_id = public.current_empresa_id();

  if v_cargo is null then
    return null;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', cc.id,
      'competencia_id', comp.id,
      'nome', comp.nome,
      'tipo', comp.tipo,
      'nivel_requerido', cc.nivel_requerido,
      'obrigatorio', cc.obrigatorio
    )
  ) into v_competencias
  from public.rh_cargo_competencias cc
  join public.rh_competencias comp
    on cc.competencia_id = comp.id
  where cc.cargo_id = p_id
    and cc.empresa_id = public.current_empresa_id();

  return v_cargo || jsonb_build_object('competencias', coalesce(v_competencias, '[]'::jsonb));
end;
$$;

create or replace function public.rh_upsert_cargo(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_empresa_id uuid := public.current_empresa_id();
  v_competencias jsonb;
  v_comp record;
begin
  if p_payload->>'id' is not null then
    update public.rh_cargos
    set
      nome = p_payload->>'nome',
      descricao = p_payload->>'descricao',
      responsabilidades = p_payload->>'responsabilidades',
      autoridades = p_payload->>'autoridades',
      setor = p_payload->>'setor',
      ativo = coalesce((p_payload->>'ativo')::boolean, true)
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.rh_cargos (empresa_id, nome, descricao, responsabilidades, autoridades, setor, ativo)
    values (
      v_empresa_id,
      p_payload->>'nome',
      p_payload->>'descricao',
      p_payload->>'responsabilidades',
      p_payload->>'autoridades',
      p_payload->>'setor',
      coalesce((p_payload->>'ativo')::boolean, true)
    )
    returning id into v_id;
  end if;

  v_competencias := p_payload->'competencias';
  if v_competencias is not null then
    delete from public.rh_cargo_competencias
    where cargo_id = v_id
      and empresa_id = v_empresa_id
      and competencia_id not in (
        select (value->>'competencia_id')::uuid
        from jsonb_array_elements(v_competencias)
      );

    for v_comp in
      select * from jsonb_array_elements(v_competencias)
    loop
      insert into public.rh_cargo_competencias (
        empresa_id, cargo_id, competencia_id, nivel_requerido, obrigatorio
      ) values (
        v_empresa_id,
        v_id,
        (v_comp.value->>'competencia_id')::uuid,
        coalesce((v_comp.value->>'nivel_requerido')::int, 1),
        coalesce((v_comp.value->>'obrigatorio')::boolean, true)
      )
      on conflict (empresa_id, cargo_id, competencia_id) do update
      set
        nivel_requerido = excluded.nivel_requerido,
        obrigatorio = excluded.obrigatorio;
    end loop;
  end if;

  perform pg_notify('app_log', '[RPC] rh_upsert_cargo: ' || v_id);
  return public.rh_get_cargo_details(v_id);
end;
$$;

create or replace function public.rh_upsert_competencia(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_payload->>'id' is not null then
    update public.rh_competencias
    set
      nome = p_payload->>'nome',
      descricao = p_payload->>'descricao',
      tipo = p_payload->>'tipo',
      critico_sgq = coalesce((p_payload->>'critico_sgq')::boolean, false),
      ativo = coalesce((p_payload->>'ativo')::boolean, true)
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.rh_competencias (empresa_id, nome, descricao, tipo, critico_sgq, ativo)
    values (
      v_empresa_id,
      p_payload->>'nome',
      p_payload->>'descricao',
      p_payload->>'tipo',
      coalesce((p_payload->>'critico_sgq')::boolean, false),
      coalesce((p_payload->>'ativo')::boolean, true)
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] rh_upsert_competencia: ' || v_id);

  return (
    select to_jsonb(c.*)
    from public.rh_competencias c
    where c.id = v_id
  );
end;
$$;

create or replace function public.rh_get_colaborador_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_colaborador jsonb;
  v_competencias jsonb;
  v_cargo_id uuid;
begin
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

  select jsonb_agg(
    jsonb_build_object(
      'competencia_id',  coalesce(req.competencia_id, aval.competencia_id),
      'nome',            comp.nome,
      'tipo',            comp.tipo,
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

  return v_colaborador || jsonb_build_object('competencias', coalesce(v_competencias, '[]'::jsonb));
end;
$$;

create or replace function public.rh_upsert_colaborador(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_empresa_id uuid := public.current_empresa_id();
  v_competencias jsonb;
  v_comp record;
  v_nivel int;
begin
  if p_payload->>'id' is not null then
    update public.rh_colaboradores
    set
      nome = p_payload->>'nome',
      email = p_payload->>'email',
      documento = p_payload->>'documento',
      data_admissao = (p_payload->>'data_admissao')::date,
      cargo_id = (p_payload->>'cargo_id')::uuid,
      ativo = coalesce((p_payload->>'ativo')::boolean, true)
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.rh_colaboradores (empresa_id, nome, email, documento, data_admissao, cargo_id, ativo)
    values (
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

  v_competencias := p_payload->'competencias';
  if v_competencias is not null then
    for v_comp in
      select * from jsonb_array_elements(v_competencias)
    loop
      v_nivel := coalesce((v_comp.value->>'nivel_atual')::int, 0);

      if v_nivel > 0 then
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
          nivel_atual = excluded.nivel_atual,
          data_avaliacao = excluded.data_avaliacao,
          origem = excluded.origem;
      else
        delete from public.rh_colaborador_competencias
        where empresa_id = v_empresa_id
          and colaborador_id = v_id
          and competencia_id = (v_comp.value->>'competencia_id')::uuid;
      end if;
    end loop;
  end if;

  perform pg_notify('app_log', '[RPC] rh_upsert_colaborador: ' || v_id);
  return public.rh_get_colaborador_details(v_id);
end;
$$;

create or replace function public.rh_get_competency_matrix(p_cargo_id uuid default null)
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
  reqs as (
    select
      cc.cargo_id,
      cc.competencia_id,
      cc.nivel_requerido,
      cc.obrigatorio
    from public.rh_cargo_competencias cc
    where cc.empresa_id = v_empresa_id
  ),
  avals as (
    select
      rcc.colaborador_id,
      rcc.competencia_id,
      rcc.nivel_atual
    from public.rh_colaborador_competencias rcc
    where rcc.empresa_id = v_empresa_id
  ),
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

create or replace function public.rh_list_treinamentos(
  p_search text default null,
  p_status text default null
)
returns table (
  id uuid,
  nome text,
  tipo text,
  status text,
  data_inicio timestamptz,
  instrutor text,
  total_participantes bigint
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
    t.id,
    t.nome,
    t.tipo,
    t.status,
    t.data_inicio,
    t.instrutor,
    (
      select count(*)
      from public.rh_treinamento_participantes p
      where p.treinamento_id = t.id
        and p.empresa_id = v_empresa_id
    ) as total_participantes
  from public.rh_treinamentos t
  where t.empresa_id = v_empresa_id
    and (p_search is null or t.nome ilike '%' || p_search || '%')
    and (p_status is null or t.status = p_status)
  order by t.data_inicio desc nulls last, t.created_at desc;
end;
$$;

create or replace function public.rh_get_treinamento_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_treinamento jsonb;
  v_participantes jsonb;
begin
  select to_jsonb(t.*)
  into v_treinamento
  from public.rh_treinamentos t
  where t.id = p_id
    and t.empresa_id = v_empresa_id;

  if v_treinamento is null then
    return null;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'colaborador_id', p.colaborador_id,
      'nome', c.nome,
      'cargo', cg.nome,
      'status', p.status,
      'nota_final', p.nota_final,
      'certificado_url', p.certificado_url,
      'eficacia_avaliada', p.eficacia_avaliada,
      'parecer_eficacia', p.parecer_eficacia
    )
    order by c.nome
  )
  into v_participantes
  from public.rh_treinamento_participantes p
  join public.rh_colaboradores c on p.colaborador_id = c.id
  left join public.rh_cargos cg on c.cargo_id = cg.id
  where p.treinamento_id = p_id
    and p.empresa_id = v_empresa_id;

  return v_treinamento || jsonb_build_object('participantes', coalesce(v_participantes, '[]'::jsonb));
end;
$$;

create or replace function public.rh_upsert_treinamento(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_payload->>'id' is not null then
    update public.rh_treinamentos
    set
      nome = p_payload->>'nome',
      descricao = p_payload->>'descricao',
      tipo = p_payload->>'tipo',
      status = p_payload->>'status',
      data_inicio = (p_payload->>'data_inicio')::timestamptz,
      data_fim = (p_payload->>'data_fim')::timestamptz,
      carga_horaria_horas = (p_payload->>'carga_horaria_horas')::numeric,
      instrutor = p_payload->>'instrutor',
      localizacao = p_payload->>'localizacao',
      custo_estimado = (p_payload->>'custo_estimado')::numeric,
      custo_real = (p_payload->>'custo_real')::numeric,
      objetivo = p_payload->>'objetivo'
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.rh_treinamentos (
      empresa_id, nome, descricao, tipo, status, data_inicio, data_fim,
      carga_horaria_horas, instrutor, localizacao, custo_estimado, custo_real, objetivo
    ) values (
      v_empresa_id,
      p_payload->>'nome',
      p_payload->>'descricao',
      p_payload->>'tipo',
      coalesce(p_payload->>'status', 'planejado'),
      (p_payload->>'data_inicio')::timestamptz,
      (p_payload->>'data_fim')::timestamptz,
      (p_payload->>'carga_horaria_horas')::numeric,
      p_payload->>'instrutor',
      p_payload->>'localizacao',
      (p_payload->>'custo_estimado')::numeric,
      (p_payload->>'custo_real')::numeric,
      p_payload->>'objetivo'
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] rh_upsert_treinamento: ' || v_id);
  return public.rh_get_treinamento_details(v_id);
end;
$$;

-- Mantém também a assinatura antiga para compatibilidade.
create or replace function public.rh_manage_participante(
  p_treinamento_id uuid,
  p_colaborador_id uuid,
  p_action text,
  p_status text default 'inscrito',
  p_nota numeric default null,
  p_certificado_url text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_action = 'remove' then
    delete from public.rh_treinamento_participantes
    where treinamento_id = p_treinamento_id
      and colaborador_id = p_colaborador_id
      and empresa_id = v_empresa_id;
  elsif p_action = 'add' then
    insert into public.rh_treinamento_participantes (empresa_id, treinamento_id, colaborador_id, status)
    values (v_empresa_id, p_treinamento_id, p_colaborador_id, p_status)
    on conflict (empresa_id, treinamento_id, colaborador_id) do nothing;
  elsif p_action = 'update' then
    update public.rh_treinamento_participantes
    set
      status = p_status,
      nota_final = p_nota,
      certificado_url = p_certificado_url
    where treinamento_id = p_treinamento_id
      and colaborador_id = p_colaborador_id
      and empresa_id = v_empresa_id;
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] rh_manage_participante: '
      || coalesce(p_action, 'nil')
      || ' treino=' || coalesce(p_treinamento_id::text, 'null')
      || ' colab='  || coalesce(p_colaborador_id::text, 'null')
  );
end;
$$;

create or replace function public.rh_manage_participante(
  p_treinamento_id uuid,
  p_colaborador_id uuid,
  p_action text,
  p_status text default 'inscrito',
  p_nota numeric default null,
  p_certificado_url text default null,
  p_parecer_eficacia text default null,
  p_eficacia_avaliada boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_action = 'remove' then
    delete from public.rh_treinamento_participantes
    where treinamento_id = p_treinamento_id
      and colaborador_id = p_colaborador_id
      and empresa_id = v_empresa_id;
  elsif p_action = 'add' then
    insert into public.rh_treinamento_participantes (empresa_id, treinamento_id, colaborador_id, status)
    values (v_empresa_id, p_treinamento_id, p_colaborador_id, p_status)
    on conflict (empresa_id, treinamento_id, colaborador_id) do nothing;
  elsif p_action = 'update' then
    update public.rh_treinamento_participantes
    set
      status = p_status,
      nota_final = p_nota,
      certificado_url = p_certificado_url,
      parecer_eficacia = p_parecer_eficacia,
      eficacia_avaliada = p_eficacia_avaliada,
      updated_at = now()
    where treinamento_id = p_treinamento_id
      and colaborador_id = p_colaborador_id
      and empresa_id = v_empresa_id;
  end if;

  perform pg_notify('app_log', '[RPC] rh_manage_participante: ' || p_action || ' training=' || p_treinamento_id);
end;
$$;

create or replace function public.get_rh_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_total_colaboradores int;
  v_total_cargos int;
  v_gaps_identificados int;
  v_treinamentos_concluidos int;
  v_investimento_treinamento numeric;
  v_top_gaps jsonb;
  v_status_treinamentos jsonb;
begin
  select count(*)
  into v_total_colaboradores
  from public.rh_colaboradores c
  where c.empresa_id = v_empresa_id
    and c.ativo = true;

  select count(*)
  into v_total_cargos
  from public.rh_cargos cg
  where cg.empresa_id = v_empresa_id
    and cg.ativo = true;

  select count(*)
  into v_gaps_identificados
  from public.rh_colaboradores c
  join public.rh_cargo_competencias req
    on c.cargo_id = req.cargo_id
   and req.empresa_id = v_empresa_id
  left join public.rh_colaborador_competencias aval
    on aval.colaborador_id = c.id
   and aval.competencia_id = req.competencia_id
   and aval.empresa_id = v_empresa_id
  where c.empresa_id = v_empresa_id
    and c.ativo = true
    and req.obrigatorio = true
    and coalesce(aval.nivel_atual, 0) < req.nivel_requerido;

  select count(*), coalesce(sum(t.custo_real), 0)
  into v_treinamentos_concluidos, v_investimento_treinamento
  from public.rh_treinamentos t
  where t.empresa_id = v_empresa_id
    and t.status = 'concluido';

  select jsonb_agg(t)
  into v_top_gaps
  from (
    select comp.nome, count(*) as total_gaps
    from public.rh_colaboradores c
    join public.rh_cargo_competencias req
      on c.cargo_id = req.cargo_id
     and req.empresa_id = v_empresa_id
    left join public.rh_colaborador_competencias aval
      on aval.colaborador_id = c.id
     and aval.competencia_id = req.competencia_id
     and aval.empresa_id = v_empresa_id
    join public.rh_competencias comp
      on comp.id = req.competencia_id
     and comp.empresa_id = v_empresa_id
    where c.empresa_id = v_empresa_id
      and c.ativo = true
      and req.obrigatorio = true
      and coalesce(aval.nivel_atual, 0) < req.nivel_requerido
    group by comp.nome
    order by total_gaps desc
    limit 5
  ) t;

  select jsonb_agg(t)
  into v_status_treinamentos
  from (
    select t.status, count(*) as total
    from public.rh_treinamentos t
    where t.empresa_id = v_empresa_id
    group by t.status
  ) t;

  perform pg_notify('app_log', '[RPC] get_rh_dashboard_stats: empresa=' || coalesce(v_empresa_id::text, 'null'));

  return jsonb_build_object(
    'total_colaboradores', v_total_colaboradores,
    'total_cargos', v_total_cargos,
    'gaps_identificados', v_gaps_identificados,
    'treinamentos_concluidos', v_treinamentos_concluidos,
    'investimento_treinamento', v_investimento_treinamento,
    'top_gaps', coalesce(v_top_gaps, '[]'::jsonb),
    'status_treinamentos', coalesce(v_status_treinamentos, '[]'::jsonb)
  );
end;
$$;

create or replace function public.seed_rh_module()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_cargo_dev uuid;
  v_cargo_lead uuid;
  v_cargo_analista uuid;
  v_comp_react uuid;
  v_comp_node uuid;
  v_comp_lideranca uuid;
  v_comp_ingles uuid;
  v_comp_iso uuid;
  v_colab_joao uuid;
  v_colab_maria uuid;
  v_colab_pedro uuid;
  v_treino_id uuid;
begin
  if exists (select 1 from public.rh_cargos where empresa_id = v_empresa_id)
     or exists (select 1 from public.rh_competencias where empresa_id = v_empresa_id)
     or exists (select 1 from public.rh_colaboradores where empresa_id = v_empresa_id)
     or exists (select 1 from public.rh_treinamentos where empresa_id = v_empresa_id)
  then
    return;
  end if;

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

  insert into public.rh_cargos (empresa_id, nome, setor, descricao)
    values (v_empresa_id, 'Desenvolvedor Full-Stack', 'Tecnologia', 'Atua no front e back-end.')
    returning id into v_cargo_dev;

  insert into public.rh_cargos (empresa_id, nome, setor, descricao)
    values (v_empresa_id, 'Tech Lead', 'Tecnologia', 'Liderança técnica do time.')
    returning id into v_cargo_lead;

  insert into public.rh_cargos (empresa_id, nome, setor, descricao)
    values (v_empresa_id, 'Analista de Qualidade', 'Qualidade', 'Gestão do SGQ e processos.')
    returning id into v_cargo_analista;

  insert into public.rh_cargo_competencias (empresa_id, cargo_id, competencia_id, nivel_requerido, obrigatorio) values
    (v_empresa_id, v_cargo_dev, v_comp_react, 4, true),
    (v_empresa_id, v_cargo_dev, v_comp_node, 4, true),
    (v_empresa_id, v_cargo_dev, v_comp_ingles, 3, false);

  insert into public.rh_cargo_competencias (empresa_id, cargo_id, competencia_id, nivel_requerido, obrigatorio) values
    (v_empresa_id, v_cargo_lead, v_comp_react, 5, true),
    (v_empresa_id, v_cargo_lead, v_comp_node, 5, true),
    (v_empresa_id, v_cargo_lead, v_comp_lideranca, 4, true);

  insert into public.rh_cargo_competencias (empresa_id, cargo_id, competencia_id, nivel_requerido, obrigatorio) values
    (v_empresa_id, v_cargo_analista, v_comp_iso, 5, true),
    (v_empresa_id, v_cargo_analista, v_comp_ingles, 3, false);

  insert into public.rh_colaboradores (empresa_id, nome, email, cargo_id, data_admissao, ativo)
    values (v_empresa_id, 'João Silva', 'joao@demo.com', v_cargo_dev, current_date - interval '2 year', true)
    returning id into v_colab_joao;

  insert into public.rh_colaboradores (empresa_id, nome, email, cargo_id, data_admissao, ativo)
    values (v_empresa_id, 'Maria Souza', 'maria@demo.com', v_cargo_lead, current_date - interval '5 year', true)
    returning id into v_colab_maria;

  insert into public.rh_colaboradores (empresa_id, nome, email, cargo_id, data_admissao, ativo)
    values (v_empresa_id, 'Pedro Santos', 'pedro@demo.com', v_cargo_analista, current_date - interval '1 year', true)
    returning id into v_colab_pedro;

  insert into public.rh_colaborador_competencias (empresa_id, colaborador_id, competencia_id, nivel_atual, data_avaliacao)
    values
      (v_empresa_id, v_colab_joao, v_comp_react, 3, current_date),
      (v_empresa_id, v_colab_joao, v_comp_node, 4, current_date);

  insert into public.rh_colaborador_competencias (empresa_id, colaborador_id, competencia_id, nivel_atual, data_avaliacao)
    values
      (v_empresa_id, v_colab_maria, v_comp_react, 5, current_date),
      (v_empresa_id, v_colab_maria, v_comp_lideranca, 3, current_date);

  insert into public.rh_colaborador_competencias (empresa_id, colaborador_id, competencia_id, nivel_atual, data_avaliacao)
    values
      (v_empresa_id, v_colab_pedro, v_comp_iso, 5, current_date);

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

  insert into public.rh_treinamento_participantes (empresa_id, treinamento_id, colaborador_id, status, nota_final, eficacia_avaliada)
    values (v_empresa_id, v_treino_id, v_colab_joao, 'concluido', 9.5, true);

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

  perform pg_notify('app_log', '[SEED] seed_rh_module: empresa=' || coalesce(v_empresa_id::text, 'null'));
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants (RPCs)
-- -----------------------------------------------------------------------------

revoke all on function public.rh_list_cargos(text, boolean) from public, anon;
grant execute on function public.rh_list_cargos(text, boolean) to authenticated, service_role;

revoke all on function public.rh_list_competencias(text) from public, anon;
grant execute on function public.rh_list_competencias(text) to authenticated, service_role;

revoke all on function public.rh_list_colaboradores(text, uuid, boolean) from public, anon;
grant execute on function public.rh_list_colaboradores(text, uuid, boolean) to authenticated, service_role;

revoke all on function public.rh_get_cargo_details(uuid) from public, anon;
grant execute on function public.rh_get_cargo_details(uuid) to authenticated, service_role;

revoke all on function public.rh_upsert_cargo(jsonb) from public, anon;
grant execute on function public.rh_upsert_cargo(jsonb) to authenticated, service_role;

revoke all on function public.rh_upsert_competencia(jsonb) from public, anon;
grant execute on function public.rh_upsert_competencia(jsonb) to authenticated, service_role;

revoke all on function public.rh_get_colaborador_details(uuid) from public, anon;
grant execute on function public.rh_get_colaborador_details(uuid) to authenticated, service_role;

revoke all on function public.rh_upsert_colaborador(jsonb) from public, anon;
grant execute on function public.rh_upsert_colaborador(jsonb) to authenticated, service_role;

revoke all on function public.rh_get_competency_matrix(uuid) from public, anon;
grant execute on function public.rh_get_competency_matrix(uuid) to authenticated, service_role;

revoke all on function public.rh_list_treinamentos(text, text) from public, anon;
grant execute on function public.rh_list_treinamentos(text, text) to authenticated, service_role;

revoke all on function public.rh_get_treinamento_details(uuid) from public, anon;
grant execute on function public.rh_get_treinamento_details(uuid) to authenticated, service_role;

revoke all on function public.rh_upsert_treinamento(jsonb) from public, anon;
grant execute on function public.rh_upsert_treinamento(jsonb) to authenticated, service_role;

revoke all on function public.rh_manage_participante(uuid, uuid, text, text, numeric, text) from public, anon;
grant execute on function public.rh_manage_participante(uuid, uuid, text, text, numeric, text) to authenticated, service_role;

revoke all on function public.rh_manage_participante(uuid, uuid, text, text, numeric, text, text, boolean) from public, anon;
grant execute on function public.rh_manage_participante(uuid, uuid, text, text, numeric, text, text, boolean) to authenticated, service_role;

revoke all on function public.get_rh_dashboard_stats() from public, anon;
grant execute on function public.get_rh_dashboard_stats() to authenticated, service_role;

revoke all on function public.seed_rh_module() from public, anon;
grant execute on function public.seed_rh_module() to authenticated, service_role;

COMMIT;

