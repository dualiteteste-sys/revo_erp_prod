/*
  # Indústria - Centros de Trabalho, Roteiros e Execução (Operações)

  ## Query Description
  Cria e expõe:
  - Tabela e RPCs de Centros de Trabalho
  - Tabelas e RPCs de Roteiros + Etapas
  - Tabelas e RPCs de Operações (work orders) + Apontamentos de execução

  ## Impact Summary
  - Segurança:
    - RLS por operação em todas as tabelas novas.
    - Todas as RPCs com SECURITY DEFINER e search_path = pg_catalog, public.
    - Filtros explícitos por empresa_id, com uso consistente de public.current_empresa_id().
  - Compatibilidade:
    - create table/index if not exists.
    - drop function if exists antes de recriar RPCs.
    - Não altera tabelas existentes (produção, beneficiamento ou BOM).
  - Reversibilidade:
    - Todas as tabelas, índices, policies e funções podem ser dropadas em migração futura.
  - Performance:
    - Índices em empresa_id, campos de filtro (status, centro_trabalho, etc).
    - Operações de listagem otimizadas para uso em listas e kanban.
*/


-- =============================================
-- 0. Limpeza de funções legadas (se houver)
-- =============================================

drop function if exists public.industria_centros_trabalho_list(text, boolean);
drop function if exists public.industria_centros_trabalho_upsert(jsonb);

drop function if exists public.industria_roteiros_list(
  text, uuid, text, boolean, int, int
);
drop function if exists public.industria_roteiros_get_details(uuid);
drop function if exists public.industria_roteiros_upsert(jsonb);
drop function if exists public.industria_roteiros_manage_etapa(
  uuid, uuid, jsonb, text
);

drop function if exists public.industria_operacoes_list(
  text, uuid, text, text, int, int
);
drop function if exists public.industria_operacao_update_status(
  uuid, text, int, uuid
);
drop function if exists public.industria_operacoes_minha_fila(uuid);
drop function if exists public.industria_operacao_apontar_execucao(
  uuid, text, numeric, numeric, text, text
);


-- =============================================
-- 1. CENTROS DE TRABALHO
-- =============================================

create table if not exists public.industria_centros_trabalho (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  nome text not null,
  codigo text,
  descricao text,
  ativo boolean not null default true,
  capacidade_unidade_hora numeric(15,4),
  tipo_uso text not null default 'ambos'
    check (tipo_uso in ('producao', 'beneficiamento', 'ambos')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint industria_centros_trabalho_pkey primary key (id),
  constraint industria_centros_trabalho_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade
);

-- Índices
create index if not exists idx_ind_ct_empresa
  on public.industria_centros_trabalho(empresa_id);

create index if not exists idx_ind_ct_empresa_ativo
  on public.industria_centros_trabalho(empresa_id, ativo);

create index if not exists idx_ind_ct_empresa_nome
  on public.industria_centros_trabalho(empresa_id, nome);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_ind_ct'
      and tgrelid = 'public.industria_centros_trabalho'::regclass
  ) then
    create trigger handle_updated_at_ind_ct
      before update on public.industria_centros_trabalho
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.industria_centros_trabalho enable row level security;

drop policy if exists "ind_ct_select" on public.industria_centros_trabalho;
drop policy if exists "ind_ct_insert" on public.industria_centros_trabalho;
drop policy if exists "ind_ct_update" on public.industria_centros_trabalho;
drop policy if exists "ind_ct_delete" on public.industria_centros_trabalho;

create policy "ind_ct_select"
  on public.industria_centros_trabalho
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_ct_insert"
  on public.industria_centros_trabalho
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_ct_update"
  on public.industria_centros_trabalho
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_ct_delete"
  on public.industria_centros_trabalho
  for delete
  using (empresa_id = public.current_empresa_id());


-- 1.1 RPC: Listar centros de trabalho
create or replace function public.industria_centros_trabalho_list(
  p_search text default null,
  p_ativo  boolean default null
)
returns table (
  id                       uuid,
  nome                     text,
  codigo                   text,
  descricao                text,
  ativo                    boolean,
  capacidade_unidade_hora  numeric,
  tipo_uso                 text
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
    c.codigo,
    c.descricao,
    c.ativo,
    c.capacidade_unidade_hora,
    c.tipo_uso
  from public.industria_centros_trabalho c
  where c.empresa_id = v_empresa_id
    and (p_ativo is null or c.ativo = p_ativo)
    and (
      p_search is null
      or c.nome   ilike '%' || p_search || '%'
      or c.codigo ilike '%' || p_search || '%'
    )
  order by
    c.ativo desc,
    c.nome asc;
end;
$$;

revoke all on function public.industria_centros_trabalho_list from public;
grant execute on function public.industria_centros_trabalho_list to authenticated, service_role;


-- 1.2 RPC: Upsert centro de trabalho
create or replace function public.industria_centros_trabalho_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_id         uuid;
  v_result     jsonb;
begin
  if p_payload->>'nome' is null or trim(p_payload->>'nome') = '' then
    raise exception 'Nome do centro de trabalho é obrigatório.';
  end if;

  if p_payload->>'id' is not null then
    update public.industria_centros_trabalho
    set
      nome                    = p_payload->>'nome',
      codigo                  = p_payload->>'codigo',
      descricao               = p_payload->>'descricao',
      ativo                   = coalesce((p_payload->>'ativo')::boolean, ativo),
      capacidade_unidade_hora = (p_payload->>'capacidade_unidade_hora')::numeric,
      tipo_uso                = coalesce(p_payload->>'tipo_uso', tipo_uso)
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_centros_trabalho (
      empresa_id,
      nome,
      codigo,
      descricao,
      ativo,
      capacidade_unidade_hora,
      tipo_uso
    ) values (
      v_empresa_id,
      p_payload->>'nome',
      p_payload->>'codigo',
      p_payload->>'descricao',
      coalesce((p_payload->>'ativo')::boolean, true),
      (p_payload->>'capacidade_unidade_hora')::numeric,
      coalesce(p_payload->>'tipo_uso', 'ambos')
    )
    returning id into v_id;
  end if;

  select to_jsonb(c.*)
  into v_result
  from public.industria_centros_trabalho c
  where c.id = v_id
    and c.empresa_id = v_empresa_id;

  perform pg_notify(
    'app_log',
    '[RPC] industria_centros_trabalho_upsert: ' || v_id
  );

  return v_result;
end;
$$;

revoke all on function public.industria_centros_trabalho_upsert from public;
grant execute on function public.industria_centros_trabalho_upsert to authenticated, service_role;



-- =============================================
-- 2. ROTEIROS
-- =============================================

create table if not exists public.industria_roteiros (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  produto_id uuid not null,
  tipo_bom text not null check (tipo_bom in ('producao', 'beneficiamento')),
  codigo text,
  descricao text,
  versao int not null default 1,
  ativo boolean not null default true,
  padrao_para_producao boolean not null default false,
  padrao_para_beneficiamento boolean not null default false,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint industria_roteiros_pkey primary key (id),
  constraint industria_roteiros_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint industria_roteiros_produto_fkey
    foreign key (produto_id) references public.produtos(id)
);

create table if not exists public.industria_roteiros_etapas (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  roteiro_id uuid not null,
  sequencia int not null,
  centro_trabalho_id uuid not null,
  tipo_operacao text not null default 'producao'
    check (tipo_operacao in ('setup', 'producao', 'inspecao', 'embalagem', 'outro')),
  tempo_setup_min numeric(10,2),
  tempo_ciclo_min_por_unidade numeric(10,4),
  permitir_overlap boolean not null default false,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint industria_roteiros_etapas_pkey primary key (id),
  constraint industria_roteiros_etapas_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint industria_roteiros_etapas_roteiro_fkey
    foreign key (roteiro_id) references public.industria_roteiros(id) on delete cascade,
  constraint industria_roteiros_etapas_ct_fkey
    foreign key (centro_trabalho_id) references public.industria_centros_trabalho(id)
);

-- Índices
create index if not exists idx_ind_rot_empresa
  on public.industria_roteiros(empresa_id);

create index if not exists idx_ind_rot_empresa_produto_tipo
  on public.industria_roteiros(empresa_id, produto_id, tipo_bom);

create unique index if not exists idx_ind_rot_empresa_produto_tipo_versao
  on public.industria_roteiros(empresa_id, produto_id, tipo_bom, versao);

create index if not exists idx_ind_rot_etapas_empresa_roteiro
  on public.industria_roteiros_etapas(empresa_id, roteiro_id);

create unique index if not exists idx_ind_rot_etapas_seq
  on public.industria_roteiros_etapas(empresa_id, roteiro_id, sequencia);


-- Triggers updated_at
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_ind_roteiros'
      and tgrelid = 'public.industria_roteiros'::regclass
  ) then
    create trigger handle_updated_at_ind_roteiros
      before update on public.industria_roteiros
      for each row
      execute procedure public.tg_set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_ind_roteiros_etapas'
      and tgrelid = 'public.industria_roteiros_etapas'::regclass
  ) then
    create trigger handle_updated_at_ind_roteiros_etapas
      before update on public.industria_roteiros_etapas
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.industria_roteiros           enable row level security;
alter table public.industria_roteiros_etapas    enable row level security;

drop policy if exists "ind_rot_select" on public.industria_roteiros;
drop policy if exists "ind_rot_insert" on public.industria_roteiros;
drop policy if exists "ind_rot_update" on public.industria_roteiros;
drop policy if exists "ind_rot_delete" on public.industria_roteiros;

create policy "ind_rot_select"
  on public.industria_roteiros
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_rot_insert"
  on public.industria_roteiros
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_rot_update"
  on public.industria_roteiros
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_rot_delete"
  on public.industria_roteiros
  for delete
  using (empresa_id = public.current_empresa_id());


drop policy if exists "ind_rot_etapas_select" on public.industria_roteiros_etapas;
drop policy if exists "ind_rot_etapas_insert" on public.industria_roteiros_etapas;
drop policy if exists "ind_rot_etapas_update" on public.industria_roteiros_etapas;
drop policy if exists "ind_rot_etapas_delete" on public.industria_roteiros_etapas;

create policy "ind_rot_etapas_select"
  on public.industria_roteiros_etapas
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_rot_etapas_insert"
  on public.industria_roteiros_etapas
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_rot_etapas_update"
  on public.industria_roteiros_etapas
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_rot_etapas_delete"
  on public.industria_roteiros_etapas
  for delete
  using (empresa_id = public.current_empresa_id());


-- 2.1 RPC: Listar roteiros
create or replace function public.industria_roteiros_list(
  p_search     text   default null,
  p_produto_id uuid   default null,
  p_tipo_bom   text   default null, -- 'producao' | 'beneficiamento'
  p_ativo      boolean default null,
  p_limit      int    default 50,
  p_offset     int    default 0
)
returns table (
  id                         uuid,
  produto_id                 uuid,
  produto_nome               text,
  tipo_bom                   text,
  codigo                     text,
  descricao                  text,
  versao                     int,
  ativo                      boolean,
  padrao_para_producao       boolean,
  padrao_para_beneficiamento boolean
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
    r.id,
    r.produto_id,
    p.nome as produto_nome,
    r.tipo_bom,
    r.codigo,
    r.descricao,
    r.versao,
    r.ativo,
    r.padrao_para_producao,
    r.padrao_para_beneficiamento
  from public.industria_roteiros r
  join public.produtos p
    on r.produto_id = p.id
  where r.empresa_id = v_empresa_id
    and (p_produto_id is null or r.produto_id = p_produto_id)
    and (p_tipo_bom  is null or r.tipo_bom   = p_tipo_bom)
    and (p_ativo     is null or r.ativo      = p_ativo)
    and (
      p_search is null
      or r.codigo    ilike '%' || p_search || '%'
      or r.descricao ilike '%' || p_search || '%'
      or p.nome      ilike '%' || p_search || '%'
    )
  order by
    p.nome asc,
    r.tipo_bom,
    r.versao desc,
    r.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_roteiros_list from public;
grant execute on function public.industria_roteiros_list to authenticated, service_role;


-- 2.2 RPC: Detalhes do roteiro
create or replace function public.industria_roteiros_get_details(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_roteiro    jsonb;
  v_etapas     jsonb;
begin
  select
    to_jsonb(r.*)
    || jsonb_build_object('produto_nome', p.nome)
  into v_roteiro
  from public.industria_roteiros r
  join public.produtos p
    on r.produto_id = p.id
  where r.id = p_id
    and r.empresa_id = v_empresa_id;

  if v_roteiro is null then
    return null;
  end if;

  select jsonb_agg(
           to_jsonb(e.*)
           || jsonb_build_object(
                'centro_trabalho_nome',
                ct.nome
              )
           order by e.sequencia
         )
  into v_etapas
  from public.industria_roteiros_etapas e
  join public.industria_centros_trabalho ct
    on e.centro_trabalho_id = ct.id
   and ct.empresa_id = v_empresa_id
  where e.roteiro_id = p_id
    and e.empresa_id = v_empresa_id;

  return v_roteiro
         || jsonb_build_object(
              'etapas', coalesce(v_etapas, '[]'::jsonb)
            );
end;
$$;

revoke all on function public.industria_roteiros_get_details from public;
grant execute on function public.industria_roteiros_get_details to authenticated, service_role;


-- 2.3 RPC: Upsert de roteiro
create or replace function public.industria_roteiros_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id                uuid := public.current_empresa_id();
  v_id                        uuid;
  v_tipo_bom                  text;
  v_padrao_para_producao      boolean;
  v_padrao_para_beneficiamento boolean;
  v_result                    jsonb;
begin
  v_tipo_bom := p_payload->>'tipo_bom';

  if v_tipo_bom is null or v_tipo_bom not in ('producao', 'beneficiamento') then
    raise exception 'tipo_bom inválido. Use ''producao'' ou ''beneficiamento''.';
  end if;

  if p_payload->>'produto_id' is null then
    raise exception 'produto_id é obrigatório.';
  end if;

  v_padrao_para_producao :=
    coalesce((p_payload->>'padrao_para_producao')::boolean, false);
  v_padrao_para_beneficiamento :=
    coalesce((p_payload->>'padrao_para_beneficiamento')::boolean, false);

  -- Normaliza flags conforme tipo
  if v_tipo_bom = 'producao' then
    v_padrao_para_beneficiamento := false;
  else
    v_padrao_para_producao := false;
  end if;

  if p_payload->>'id' is not null then
    update public.industria_roteiros
    set
      produto_id                 = (p_payload->>'produto_id')::uuid,
      tipo_bom                   = v_tipo_bom,
      codigo                     = p_payload->>'codigo',
      descricao                  = p_payload->>'descricao',
      versao                     = coalesce((p_payload->>'versao')::int, versao),
      ativo                      = coalesce((p_payload->>'ativo')::boolean, ativo),
      padrao_para_producao       = v_padrao_para_producao,
      padrao_para_beneficiamento = v_padrao_para_beneficiamento,
      observacoes                = p_payload->>'observacoes'
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_roteiros (
      empresa_id,
      produto_id,
      tipo_bom,
      codigo,
      descricao,
      versao,
      ativo,
      padrao_para_producao,
      padrao_para_beneficiamento,
      observacoes
    ) values (
      v_empresa_id,
      (p_payload->>'produto_id')::uuid,
      v_tipo_bom,
      p_payload->>'codigo',
      p_payload->>'descricao',
      coalesce((p_payload->>'versao')::int, 1),
      coalesce((p_payload->>'ativo')::boolean, true),
      v_padrao_para_producao,
      v_padrao_para_beneficiamento,
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  -- Se marcado como padrão, limpa outros padrões do mesmo produto/tipo
  if v_padrao_para_producao or v_padrao_para_beneficiamento then
    update public.industria_roteiros
    set
      padrao_para_producao = case
        when v_tipo_bom = 'producao' and id <> v_id then false
        else padrao_para_producao
      end,
      padrao_para_beneficiamento = case
        when v_tipo_bom = 'beneficiamento' and id <> v_id then false
        else padrao_para_beneficiamento
      end
    where empresa_id = v_empresa_id
      and produto_id = (p_payload->>'produto_id')::uuid
      and tipo_bom   = v_tipo_bom;
  end if;

  v_result := public.industria_roteiros_get_details(v_id);

  perform pg_notify(
    'app_log',
    '[RPC] industria_roteiros_upsert: ' || v_id
  );

  return v_result;
end;
$$;

revoke all on function public.industria_roteiros_upsert from public;
grant execute on function public.industria_roteiros_upsert to authenticated, service_role;


-- 2.4 RPC: Gerenciar etapa de roteiro
create or replace function public.industria_roteiros_manage_etapa(
  p_roteiro_id uuid,
  p_etapa_id   uuid,
  p_payload    jsonb,
  p_action     text -- 'upsert' | 'delete'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_seq        int;
begin
  -- Valida roteiro
  if not exists (
    select 1
    from public.industria_roteiros r
    where r.id = p_roteiro_id
      and r.empresa_id = v_empresa_id
  ) then
    raise exception 'Roteiro não encontrado ou acesso negado.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_roteiros_etapas
    where id = p_etapa_id
      and empresa_id = v_empresa_id;
    return;
  end if;

  -- upsert
  v_seq := coalesce((p_payload->>'sequencia')::int, 10);

  if p_payload->>'centro_trabalho_id' is null then
    raise exception 'centro_trabalho_id é obrigatório.';
  end if;

  if p_etapa_id is not null then
    update public.industria_roteiros_etapas
    set
      sequencia                 = v_seq,
      centro_trabalho_id        = (p_payload->>'centro_trabalho_id')::uuid,
      tipo_operacao             = coalesce(p_payload->>'tipo_operacao', tipo_operacao),
      tempo_setup_min           = (p_payload->>'tempo_setup_min')::numeric,
      tempo_ciclo_min_por_unidade = (p_payload->>'tempo_ciclo_min_por_unidade')::numeric,
      permitir_overlap          = coalesce((p_payload->>'permitir_overlap')::boolean, permitir_overlap),
      observacoes               = p_payload->>'observacoes'
    where id = p_etapa_id
      and empresa_id = v_empresa_id;
  else
    insert into public.industria_roteiros_etapas (
      empresa_id,
      roteiro_id,
      sequencia,
      centro_trabalho_id,
      tipo_operacao,
      tempo_setup_min,
      tempo_ciclo_min_por_unidade,
      permitir_overlap,
      observacoes
    ) values (
      v_empresa_id,
      p_roteiro_id,
      v_seq,
      (p_payload->>'centro_trabalho_id')::uuid,
      coalesce(p_payload->>'tipo_operacao', 'producao'),
      (p_payload->>'tempo_setup_min')::numeric,
      (p_payload->>'tempo_ciclo_min_por_unidade')::numeric,
      coalesce((p_payload->>'permitir_overlap')::boolean, false),
      p_payload->>'observacoes'
    );
  end if;
end;
$$;

revoke all on function public.industria_roteiros_manage_etapa from public;
grant execute on function public.industria_roteiros_manage_etapa to authenticated, service_role;



-- =============================================
-- 3. OPERAÇÕES (WORK ORDERS) E APONTAMENTOS
-- =============================================

create table if not exists public.industria_operacoes (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  tipo_ordem text not null
    check (tipo_ordem in ('producao', 'beneficiamento')),
  ordem_id uuid not null,
  roteiro_id uuid,
  roteiro_etapa_id uuid,
  centro_trabalho_id uuid not null,
  status text not null default 'planejada'
    check (status in (
      'planejada', 'liberada', 'em_execucao', 'em_espera',
      'em_inspecao', 'concluida', 'cancelada'
    )),
  prioridade int not null default 0,
  data_prevista_inicio date,
  data_prevista_fim date,
  quantidade_planejada  numeric(15,4),
  quantidade_produzida  numeric(15,4) not null default 0,
  quantidade_refugada   numeric(15,4) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint industria_operacoes_pkey primary key (id),
  constraint industria_operacoes_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint industria_operacoes_ct_fkey
    foreign key (centro_trabalho_id) references public.industria_centros_trabalho(id),
  constraint industria_operacoes_roteiro_fkey
    foreign key (roteiro_id) references public.industria_roteiros(id),
  constraint industria_operacoes_roteiro_etapa_fkey
    foreign key (roteiro_etapa_id) references public.industria_roteiros_etapas(id)
);

create table if not exists public.industria_operacoes_apontamentos (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  operacao_id uuid not null,
  acao text not null
    check (acao in ('iniciar', 'pausar', 'concluir')),
  qtd_boas numeric(15,4) not null default 0,
  qtd_refugadas numeric(15,4) not null default 0,
  motivo_refugo text,
  observacoes text,
  apontado_em timestamptz not null default now(),
  created_at timestamptz default now(),

  constraint industria_operacoes_apontamentos_pkey primary key (id),
  constraint industria_operacoes_apontamentos_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint industria_operacoes_apontamentos_operacao_fkey
    foreign key (operacao_id) references public.industria_operacoes(id) on delete cascade
);

-- Índices
create index if not exists idx_ind_op_empresa
  on public.industria_operacoes(empresa_id);

create index if not exists idx_ind_op_empresa_ct_status
  on public.industria_operacoes(empresa_id, centro_trabalho_id, status);

create index if not exists idx_ind_op_empresa_ordem
  on public.industria_operacoes(empresa_id, tipo_ordem, ordem_id);

create index if not exists idx_ind_op_empresa_prioridade
  on public.industria_operacoes(empresa_id, prioridade);

create index if not exists idx_ind_op_apont_empresa_op
  on public.industria_operacoes_apontamentos(empresa_id, operacao_id);


-- Triggers updated_at
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_ind_operacoes'
      and tgrelid = 'public.industria_operacoes'::regclass
  ) then
    create trigger handle_updated_at_ind_operacoes
      before update on public.industria_operacoes
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.industria_operacoes             enable row level security;
alter table public.industria_operacoes_apontamentos enable row level security;

drop policy if exists "ind_op_select" on public.industria_operacoes;
drop policy if exists "ind_op_insert" on public.industria_operacoes;
drop policy if exists "ind_op_update" on public.industria_operacoes;
drop policy if exists "ind_op_delete" on public.industria_operacoes;

create policy "ind_op_select"
  on public.industria_operacoes
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_op_insert"
  on public.industria_operacoes
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_op_update"
  on public.industria_operacoes
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_op_delete"
  on public.industria_operacoes
  for delete
  using (empresa_id = public.current_empresa_id());


drop policy if exists "ind_op_apont_select" on public.industria_operacoes_apontamentos;
drop policy if exists "ind_op_apont_insert" on public.industria_operacoes_apontamentos;
drop policy if exists "ind_op_apont_update" on public.industria_operacoes_apontamentos;
drop policy if exists "ind_op_apont_delete" on public.industria_operacoes_apontamentos;

create policy "ind_op_apont_select"
  on public.industria_operacoes_apontamentos
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_op_apont_insert"
  on public.industria_operacoes_apontamentos
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_op_apont_update"
  on public.industria_operacoes_apontamentos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_op_apont_delete"
  on public.industria_operacoes_apontamentos
  for delete
  using (empresa_id = public.current_empresa_id());


-- 3.1 RPC: Listar operações (lista/kanban)
create or replace function public.industria_operacoes_list(
  p_view      text default 'lista', -- 'lista' | 'kanban' (não altera o resultado, é só para contrato)
  p_centro_id uuid default null,
  p_status    text default null,
  p_search    text default null,
  p_limit     int  default 100,
  p_offset    int  default 0
)
returns table (
  id                   uuid,
  ordem_id             uuid,
  ordem_numero         int,
  tipo_ordem           text,
  produto_nome         text,
  cliente_nome         text,
  centro_trabalho_id   uuid,
  centro_trabalho_nome text,
  status               text,
  prioridade           int,
  data_prevista_inicio date,
  data_prevista_fim    date,
  percentual_concluido numeric,
  atrasada             boolean
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
    op.id,
    op.ordem_id,
    coalesce(oprod.numero, obenf.numero) as ordem_numero,
    op.tipo_ordem,
    coalesce(pprod.nome, pserv.nome) as produto_nome,
    cli.nome as cliente_nome,
    ct.id as centro_trabalho_id,
    ct.nome as centro_trabalho_nome,
    op.status,
    op.prioridade,
    op.data_prevista_inicio,
    op.data_prevista_fim,
    case
      when op.quantidade_planejada is not null
           and op.quantidade_planejada > 0
      then round((coalesce(op.quantidade_produzida, 0) / op.quantidade_planejada) * 100, 2)
      else 0
    end as percentual_concluido,
    (op.data_prevista_fim is not null
     and op.data_prevista_fim < current_date
     and op.status not in ('concluida', 'cancelada')) as atrasada
  from public.industria_operacoes op
  left join public.industria_producao_ordens oprod
    on op.tipo_ordem = 'producao'
   and op.ordem_id = oprod.id
   and oprod.empresa_id = v_empresa_id
  left join public.produtos pprod
    on oprod.produto_final_id = pprod.id
  left join public.industria_benef_ordens obenf
    on op.tipo_ordem = 'beneficiamento'
   and op.ordem_id = obenf.id
   and obenf.empresa_id = v_empresa_id
  left join public.produtos pserv
    on obenf.produto_servico_id = pserv.id
  left join public.pessoas cli
    on obenf.cliente_id = cli.id
  join public.industria_centros_trabalho ct
    on op.centro_trabalho_id = ct.id
   and ct.empresa_id = v_empresa_id
  where op.empresa_id = v_empresa_id
    and ((op.tipo_ordem = 'producao' and oprod.id is not null)
      or (op.tipo_ordem = 'beneficiamento' and obenf.id is not null))
    and (p_centro_id is null or op.centro_trabalho_id = p_centro_id)
    and (p_status is null or op.status = p_status)
    and (
      p_search is null
      or coalesce(oprod.numero::text, obenf.numero::text) ilike '%' || p_search || '%'
      or coalesce(pprod.nome, pserv.nome) ilike '%' || p_search || '%'
      or cli.nome ilike '%' || p_search || '%'
    )
  order by
    op.prioridade desc,
    op.data_prevista_inicio asc nulls last,
    op.created_at asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_operacoes_list from public;
grant execute on function public.industria_operacoes_list to authenticated, service_role;


-- 3.2 RPC: Update status/centro/prioridade (kanban/fila)
create or replace function public.industria_operacao_update_status(
  p_id                 uuid,
  p_status             text,
  p_prioridade         int,
  p_centro_trabalho_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_status not in (
    'planejada', 'liberada', 'em_execucao', 'em_espera',
    'em_inspecao', 'concluida', 'cancelada'
  ) then
    raise exception 'Status inválido.';
  end if;

  -- valida centro de trabalho
  if not exists (
    select 1
    from public.industria_centros_trabalho ct
    where ct.id = p_centro_trabalho_id
      and ct.empresa_id = v_empresa_id
  ) then
    raise exception 'Centro de trabalho não encontrado ou acesso negado.';
  end if;

  update public.industria_operacoes
  set
    status             = p_status,
    prioridade         = coalesce(p_prioridade, prioridade),
    centro_trabalho_id = p_centro_trabalho_id
  where id = p_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Operação não encontrada ou acesso negado.';
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] industria_operacao_update_status: ' || p_id || ' status=' || p_status
  );
end;
$$;

revoke all on function public.industria_operacao_update_status from public;
grant execute on function public.industria_operacao_update_status to authenticated, service_role;


-- 3.3 RPC: Minha fila (por centro de trabalho)
create or replace function public.industria_operacoes_minha_fila(
  p_centro_trabalho_id uuid
)
returns table (
  id                   uuid,
  ordem_id             uuid,
  ordem_numero         int,
  tipo_ordem           text,
  produto_nome         text,
  cliente_nome         text,
  status               text,
  prioridade           int,
  data_prevista_inicio date,
  data_prevista_fim    date,
  quantidade_planejada numeric,
  quantidade_produzida numeric,
  quantidade_refugada  numeric,
  percentual_concluido numeric,
  atrasada             boolean
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
    op.id,
    op.ordem_id,
    coalesce(oprod.numero, obenf.numero) as ordem_numero,
    op.tipo_ordem,
    coalesce(pprod.nome, pserv.nome) as produto_nome,
    cli.nome as cliente_nome,
    op.status,
    op.prioridade,
    op.data_prevista_inicio,
    op.data_prevista_fim,
    op.quantidade_planejada,
    op.quantidade_produzida,
    op.quantidade_refugada,
    case
      when op.quantidade_planejada is not null
           and op.quantidade_planejada > 0
      then round((coalesce(op.quantidade_produzida, 0) / op.quantidade_planejada) * 100, 2)
      else 0
    end as percentual_concluido,
    (op.data_prevista_fim is not null
     and op.data_prevista_fim < current_date
     and op.status not in ('concluida', 'cancelada')) as atrasada
  from public.industria_operacoes op
  left join public.industria_producao_ordens oprod
    on op.tipo_ordem = 'producao'
   and op.ordem_id = oprod.id
   and oprod.empresa_id = v_empresa_id
  left join public.produtos pprod
    on oprod.produto_final_id = pprod.id
  left join public.industria_benef_ordens obenf
    on op.tipo_ordem = 'beneficiamento'
   and op.ordem_id = obenf.id
   and obenf.empresa_id = v_empresa_id
  left join public.produtos pserv
    on obenf.produto_servico_id = pserv.id
  left join public.pessoas cli
    on obenf.cliente_id = cli.id
  where op.empresa_id = v_empresa_id
    and op.centro_trabalho_id = p_centro_trabalho_id
    and op.status in ('planejada', 'liberada', 'em_execucao', 'em_espera')
  order by
    op.status, -- opcional: agrupar por status
    op.prioridade desc,
    op.data_prevista_inicio asc nulls last,
    op.created_at asc;
end;
$$;

revoke all on function public.industria_operacoes_minha_fila from public;
grant execute on function public.industria_operacoes_minha_fila to authenticated, service_role;


-- 3.4 RPC: Apontar execução (chão de fábrica)
create or replace function public.industria_operacao_apontar_execucao(
  p_operacao_id   uuid,
  p_acao          text,   -- 'iniciar' | 'pausar' | 'concluir'
  p_qtd_boas      numeric,
  p_qtd_refugadas numeric,
  p_motivo_refugo text,
  p_observacoes   text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_op         record;
  v_qtd_boas   numeric := coalesce(p_qtd_boas, 0);
  v_qtd_ref    numeric := coalesce(p_qtd_refugadas, 0);
  v_novo_total numeric;
  v_novo_status text;
begin
  if p_acao not in ('iniciar', 'pausar', 'concluir') then
    raise exception 'Ação inválida. Use iniciar, pausar ou concluir.';
  end if;

  select *
  into v_op
  from public.industria_operacoes op
  where op.id = p_operacao_id
    and op.empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception 'Operação não encontrada ou acesso negado.';
  end if;

  v_novo_total :=
    coalesce(v_op.quantidade_produzida, 0)
    + v_qtd_boas
    + coalesce(v_op.quantidade_refugada, 0)
    + v_qtd_ref;

  if v_op.quantidade_planejada is not null
     and v_op.quantidade_planejada > 0
     and v_novo_total > v_op.quantidade_planejada
  then
    raise exception 'Quantidade total (boas + refugadas) excede a quantidade planejada.';
  end if;

  if p_acao = 'iniciar' then
    v_novo_status := 'em_execucao';
  elsif p_acao = 'pausar' then
    v_novo_status := 'em_espera';
  else -- concluir
    v_novo_status := 'concluida';
  end if;

  -- atualiza operação
  update public.industria_operacoes
  set
    status              = v_novo_status,
    quantidade_produzida = coalesce(v_op.quantidade_produzida, 0) + v_qtd_boas,
    quantidade_refugada  = coalesce(v_op.quantidade_refugada, 0) + v_qtd_ref
  where id = v_op.id
    and empresa_id = v_empresa_id;

  -- registra apontamento
  insert into public.industria_operacoes_apontamentos (
    empresa_id,
    operacao_id,
    acao,
    qtd_boas,
    qtd_refugadas,
    motivo_refugo,
    observacoes
  ) values (
    v_empresa_id,
    v_op.id,
    p_acao,
    v_qtd_boas,
    v_qtd_ref,
    p_motivo_refugo,
    p_observacoes
  );

  perform pg_notify(
    'app_log',
    '[RPC] industria_operacao_apontar_execucao: ' || v_op.id ||
    ' acao=' || p_acao ||
    ' boas=' || v_qtd_boas ||
    ' ref=' || v_qtd_ref
  );
end;
$$;

revoke all on function public.industria_operacao_apontar_execucao from public;
grant execute on function public.industria_operacao_apontar_execucao to authenticated, service_role;
