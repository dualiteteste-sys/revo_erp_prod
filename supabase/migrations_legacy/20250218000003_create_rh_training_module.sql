/*
  # Módulo RH 2 - Gestão de Treinamentos (ISO 9001 7.2)

  ## Query Description
  Implementa tabelas e funções para gestão de treinamentos, participantes e avaliação de eficácia.
  Permite agendar treinamentos, registrar presença/conclusão e anexar evidências.

  ## Impact Summary
  - Segurança:
    - RLS ativa em todas as novas tabelas (rh_treinamentos, rh_treinamento_participantes).
    - RPCs SECURITY DEFINER com search_path restrito (pg_catalog, public).
  - Compatibilidade:
    - create table if not exists.
    - Policies recriadas com drop if exists.
    - Triggers updated_at padronizados e idempotentes.
  - Performance:
    - Índices em chaves estrangeiras (empresa_id, colaborador_id, treinamento_id).
*/

-- =============================================
-- 1. Tabelas
-- =============================================

-- 1.1. Treinamentos
create table if not exists public.rh_treinamentos (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  nome text not null,
  descricao text,
  tipo text not null check (tipo in ('interno', 'externo', 'online', 'on_the_job')),
  status text not null default 'planejado' check (status in ('planejado', 'agendado', 'em_andamento', 'concluido', 'cancelado')),
  data_inicio timestamptz,
  data_fim timestamptz,
  carga_horaria_horas numeric(10,2),
  instrutor text,
  localizacao text,
  custo_estimado numeric(10,2) default 0,
  custo_real numeric(10,2) default 0,
  objetivo text, -- Qual gap ou competência visa atender
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint rh_treinamentos_pkey primary key (id),
  constraint rh_treinamentos_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade
);

-- 1.2. Participantes do Treinamento
create table if not exists public.rh_treinamento_participantes (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  treinamento_id uuid not null,
  colaborador_id uuid not null,
  status text not null default 'inscrito' check (status in ('inscrito', 'confirmado', 'concluido', 'reprovado', 'ausente')),
  nota_final numeric(5,2), -- Opcional
  certificado_url text,    -- Link para evidência no Storage
  comentarios text,
  eficacia_avaliada boolean default false,
  parecer_eficacia text,   -- Avaliação posterior (ISO 9001)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint rh_treinamento_part_pkey primary key (id),
  constraint rh_treinamento_part_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint rh_treinamento_part_treino_fkey foreign key (treinamento_id) references public.rh_treinamentos(id) on delete cascade,
  constraint rh_treinamento_part_colab_fkey foreign key (colaborador_id) references public.rh_colaboradores(id) on delete cascade
);

-- Garante UNIQUE (empresa_id, treinamento_id, colaborador_id)
do $$
begin
  if not exists (
    select 1
    from pg_constraint 
    where conname = 'rh_treinamento_participantes_unique'
      and conrelid = 'public.rh_treinamento_participantes'::regclass
  ) then
    alter table public.rh_treinamento_participantes
      add constraint rh_treinamento_participantes_unique
        unique (empresa_id, treinamento_id, colaborador_id);
  end if;
end;
$$;

-- =============================================
-- 2. Índices
-- =============================================

create index if not exists idx_rh_treinamentos_empresa on public.rh_treinamentos(empresa_id);
create index if not exists idx_rh_treinamentos_status  on public.rh_treinamentos(status);
create index if not exists idx_rh_part_treinamento     on public.rh_treinamento_participantes(treinamento_id);
create index if not exists idx_rh_part_colaborador     on public.rh_treinamento_participantes(colaborador_id);
create index if not exists idx_rh_part_empresa         on public.rh_treinamento_participantes(empresa_id);

-- =============================================
-- 3. Triggers updated_at
-- =============================================

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_rh_treinamentos'
      and tgrelid = 'public.rh_treinamentos'::regclass
  ) then
    create trigger handle_updated_at_rh_treinamentos
      before update on public.rh_treinamentos
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_rh_treinamento_part'
      and tgrelid = 'public.rh_treinamento_participantes'::regclass
  ) then
    create trigger handle_updated_at_rh_treinamento_part
      before update on public.rh_treinamento_participantes
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =============================================
-- 4. RLS Policies
-- =============================================

alter table public.rh_treinamentos enable row level security;
alter table public.rh_treinamento_participantes enable row level security;

-- rh_treinamentos
drop policy if exists "rh_treinamentos_select" on public.rh_treinamentos;
drop policy if exists "rh_treinamentos_insert" on public.rh_treinamentos;
drop policy if exists "rh_treinamentos_update" on public.rh_treinamentos;
drop policy if exists "rh_treinamentos_delete" on public.rh_treinamentos;

create policy "rh_treinamentos_select" on public.rh_treinamentos
  for select using (empresa_id = public.current_empresa_id());

create policy "rh_treinamentos_insert" on public.rh_treinamentos
  for insert with check (empresa_id = public.current_empresa_id());

create policy "rh_treinamentos_update" on public.rh_treinamentos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "rh_treinamentos_delete" on public.rh_treinamentos
  for delete using (empresa_id = public.current_empresa_id());

-- rh_treinamento_participantes
drop policy if exists "rh_part_select" on public.rh_treinamento_participantes;
drop policy if exists "rh_part_insert" on public.rh_treinamento_participantes;
drop policy if exists "rh_part_update" on public.rh_treinamento_participantes;
drop policy if exists "rh_part_delete" on public.rh_treinamento_participantes;

create policy "rh_part_select" on public.rh_treinamento_participantes
  for select using (empresa_id = public.current_empresa_id());

create policy "rh_part_insert" on public.rh_treinamento_participantes
  for insert with check (empresa_id = public.current_empresa_id());

create policy "rh_part_update" on public.rh_treinamento_participantes
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "rh_part_delete" on public.rh_treinamento_participantes
  for delete using (empresa_id = public.current_empresa_id());

-- =============================================
-- 5. RPCs
-- =============================================

-- 5.0: (opcional) drop prévio se já existirem versões antigas
drop function if exists public.rh_list_treinamentos(text, text);
drop function if exists public.rh_get_treinamento_details(uuid);
drop function if exists public.rh_upsert_treinamento(jsonb);
drop function if exists public.rh_manage_participante(uuid, uuid, text, text, numeric, text);

-- 5.1 Listar Treinamentos
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

revoke all on function public.rh_list_treinamentos from public;
grant execute on function public.rh_list_treinamentos to authenticated, service_role;

-- 5.2 Detalhes do Treinamento (com participantes)
create or replace function public.rh_get_treinamento_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id   uuid := public.current_empresa_id();
  v_treinamento  jsonb;
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
             'id',               p.id,
             'colaborador_id',   p.colaborador_id,
             'nome',             c.nome,
             'cargo',            cg.nome,
             'status',           p.status,
             'nota_final',       p.nota_final,
             'certificado_url',  p.certificado_url,
             'eficacia_avaliada', p.eficacia_avaliada
           )
           order by c.nome
         )
  into v_participantes
  from public.rh_treinamento_participantes p
  join public.rh_colaboradores c
    on p.colaborador_id = c.id
  left join public.rh_cargos cg
    on c.cargo_id = cg.id
  where p.treinamento_id = p_id
    and p.empresa_id = v_empresa_id;

  return v_treinamento
         || jsonb_build_object('participantes', coalesce(v_participantes, '[]'::jsonb));
end;
$$;

revoke all on function public.rh_get_treinamento_details from public;
grant execute on function public.rh_get_treinamento_details to authenticated, service_role;

-- 5.3 Upsert Treinamento
create or replace function public.rh_upsert_treinamento(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id         uuid;
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_payload->>'id' is not null then
    update public.rh_treinamentos
    set
      nome                = p_payload->>'nome',
      descricao           = p_payload->>'descricao',
      tipo                = p_payload->>'tipo',
      status              = p_payload->>'status',
      data_inicio         = (p_payload->>'data_inicio')::timestamptz,
      data_fim            = (p_payload->>'data_fim')::timestamptz,
      carga_horaria_horas = (p_payload->>'carga_horaria_horas')::numeric,
      instrutor           = p_payload->>'instrutor',
      localizacao         = p_payload->>'localizacao',
      custo_estimado      = (p_payload->>'custo_estimado')::numeric,
      custo_real          = (p_payload->>'custo_real')::numeric,
      objetivo            = p_payload->>'objetivo'
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

revoke all on function public.rh_upsert_treinamento from public;
grant execute on function public.rh_upsert_treinamento to authenticated, service_role;

-- 5.4 Gerenciar Participantes (Adicionar/Remover/Atualizar)
create or replace function public.rh_manage_participante(
  p_treinamento_id   uuid,
  p_colaborador_id   uuid,
  p_action           text, -- 'add', 'remove', 'update'
  p_status           text default 'inscrito',
  p_nota             numeric default null,
  p_certificado_url  text default null
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
    insert into public.rh_treinamento_participantes (
      empresa_id, treinamento_id, colaborador_id, status
    ) values (
      v_empresa_id, p_treinamento_id, p_colaborador_id, p_status
    )
    on conflict (empresa_id, treinamento_id, colaborador_id) do nothing;
    
  elsif p_action = 'update' then
    update public.rh_treinamento_participantes
    set
      status          = p_status,
      nota_final      = p_nota,
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

revoke all on function public.rh_manage_participante from public;
grant execute on function public.rh_manage_participante(uuid, uuid, text, text, numeric, text) to authenticated, service_role;
