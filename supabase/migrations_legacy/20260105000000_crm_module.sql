/*
  # CRM - Gestão de Oportunidades (Funil de Vendas)
  
  ## Impact Summary
  - Criação de tabelas: crm_funis, crm_etapas, crm_oportunidades
  - RLS por operação (USING + WITH CHECK) para segurança forte
  - RPCs para gestão do Kanban (listagem, movimentação, upsert)
  - Índices e constraints para integridade e performance
*/

-- =========================
-- 1) Tabelas
-- =========================

create table if not exists public.crm_funis (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.current_empresa_id(),
  nome           text not null,
  descricao      text,
  padrao         boolean default false,
  ativo          boolean default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  constraint crm_funis_empresa_fkey 
    foreign key (empresa_id) references public.empresas(id) on delete cascade
);

create table if not exists public.crm_etapas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.current_empresa_id(),
  funil_id       uuid not null,
  nome           text not null,
  ordem          int not null default 0,
  cor            text,
  probabilidade  int default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  constraint crm_etapas_empresa_fkey 
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint crm_etapas_funil_fkey 
    foreign key (funil_id) references public.crm_funis(id) on delete cascade
);

create table if not exists public.crm_oportunidades (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null default public.current_empresa_id(),
  funil_id        uuid not null,
  etapa_id        uuid not null,
  cliente_id      uuid,
  titulo          text not null,
  valor           numeric(15,2) default 0,
  data_fechamento date,
  status          text default 'aberto' check (status in ('aberto', 'ganho', 'perdido')),
  prioridade      text default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  origem          text,
  observacoes     text,
  responsavel_id  uuid,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  constraint crm_oportunidades_empresa_fkey 
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint crm_oportunidades_funil_fkey 
    foreign key (funil_id) references public.crm_funis(id) on delete cascade,
  constraint crm_oportunidades_etapa_fkey 
    foreign key (etapa_id) references public.crm_etapas(id) on delete cascade,
  constraint crm_oportunidades_cliente_fkey 
    foreign key (cliente_id) references public.pessoas(id) on delete set null
);

-- =========================
-- 2) Índices e Constraints
-- =========================

create index if not exists idx_crm_etapas_funil on public.crm_etapas(funil_id, ordem);
create index if not exists idx_crm_etapas_empresa_funil on public.crm_etapas(empresa_id, funil_id, ordem);
create index if not exists idx_crm_oportunidades_etapa on public.crm_oportunidades(etapa_id);
create index if not exists idx_crm_oportunidades_empresa on public.crm_oportunidades(empresa_id);
create index if not exists idx_crm_funis_empresa_padrao on public.crm_funis(empresa_id, padrao);

-- Evita duplicar etapa com mesmo nome no mesmo funil
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_etapas_funil_nome_uk'
      and conrelid = 'public.crm_etapas'::regclass
  ) then
    alter table public.crm_etapas
      add constraint crm_etapas_funil_nome_uk unique (funil_id, nome);
  end if;
end;
$$;

-- =========================
-- 3) Triggers updated_at
-- =========================

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_crm_funis') then
    create trigger handle_updated_at_crm_funis
      before update on public.crm_funis
      for each row execute procedure public.tg_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_crm_etapas') then
    create trigger handle_updated_at_crm_etapas
      before update on public.crm_etapas
      for each row execute procedure public.tg_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_crm_oportunidades') then
    create trigger handle_updated_at_crm_oportunidades
      before update on public.crm_oportunidades
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =========================
-- 4) RLS por operação
-- =========================

alter table public.crm_funis enable row level security;
alter table public.crm_etapas enable row level security;
alter table public.crm_oportunidades enable row level security;

-- Limpeza de policies antigas para evitar conflitos
drop policy if exists "crm_funis_select" on public.crm_funis;
drop policy if exists "crm_funis_insert" on public.crm_funis;
drop policy if exists "crm_funis_update" on public.crm_funis;
drop policy if exists "crm_funis_delete" on public.crm_funis;

drop policy if exists "crm_etapas_select" on public.crm_etapas;
drop policy if exists "crm_etapas_insert" on public.crm_etapas;
drop policy if exists "crm_etapas_update" on public.crm_etapas;
drop policy if exists "crm_etapas_delete" on public.crm_etapas;

drop policy if exists "crm_oports_select" on public.crm_oportunidades;
drop policy if exists "crm_oports_insert" on public.crm_oportunidades;
drop policy if exists "crm_oports_update" on public.crm_oportunidades;
drop policy if exists "crm_oports_delete" on public.crm_oportunidades;

-- crm_funis
create policy "crm_funis_select" on public.crm_funis for select using (empresa_id = public.current_empresa_id());
create policy "crm_funis_insert" on public.crm_funis for insert with check (empresa_id = public.current_empresa_id());
create policy "crm_funis_update" on public.crm_funis for update using (empresa_id = public.current_empresa_id()) with check (empresa_id = public.current_empresa_id());
create policy "crm_funis_delete" on public.crm_funis for delete using (empresa_id = public.current_empresa_id());

-- crm_etapas
create policy "crm_etapas_select" on public.crm_etapas for select using (empresa_id = public.current_empresa_id());
create policy "crm_etapas_insert" on public.crm_etapas for insert with check (empresa_id = public.current_empresa_id());
create policy "crm_etapas_update" on public.crm_etapas for update using (empresa_id = public.current_empresa_id()) with check (empresa_id = public.current_empresa_id());
create policy "crm_etapas_delete" on public.crm_etapas for delete using (empresa_id = public.current_empresa_id());

-- crm_oportunidades
create policy "crm_oports_select" on public.crm_oportunidades for select using (empresa_id = public.current_empresa_id());
create policy "crm_oports_insert" on public.crm_oportunidades for insert with check (empresa_id = public.current_empresa_id());
create policy "crm_oports_update" on public.crm_oportunidades for update using (empresa_id = public.current_empresa_id()) with check (empresa_id = public.current_empresa_id());
create policy "crm_oports_delete" on public.crm_oportunidades for delete using (empresa_id = public.current_empresa_id());

-- =========================
-- 5) RPCs
-- =========================

-- 5.1 Seed padrão
create or replace function public.crm_ensure_default_pipeline()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_funil_id uuid;
begin
  select id into v_funil_id
  from public.crm_funis
  where empresa_id = v_empresa and padrao = true
  limit 1;

  if v_funil_id is null then
    insert into public.crm_funis (empresa_id, nome, descricao, padrao, ativo)
    values (v_empresa, 'Funil de Vendas Padrão', 'Processo de vendas geral', true, true)
    returning id into v_funil_id;

    insert into public.crm_etapas (empresa_id, funil_id, nome, ordem, cor, probabilidade) values
      (v_empresa, v_funil_id, 'Prospecção',   1, 'bg-gray-100',   10),
      (v_empresa, v_funil_id, 'Qualificação', 2, 'bg-blue-100',   30),
      (v_empresa, v_funil_id, 'Proposta',     3, 'bg-yellow-100', 60),
      (v_empresa, v_funil_id, 'Negociação',   4, 'bg-orange-100', 80),
      (v_empresa, v_funil_id, 'Fechado Ganho',5, 'bg-green-100',  100);
  end if;

  perform pg_notify('app_log','[RPC] crm_ensure_default_pipeline empresa='||v_empresa||' funil='||v_funil_id);
  return jsonb_build_object('funil_id', v_funil_id);
end;
$$;
revoke all on function public.crm_ensure_default_pipeline() from public;
grant execute on function public.crm_ensure_default_pipeline() to authenticated, service_role;

-- 5.2 Kanban
create or replace function public.crm_get_kanban_data(
  p_funil_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_target_funil uuid := p_funil_id;
  v_result jsonb;
begin
  if v_target_funil is null then
    select id into v_target_funil
    from public.crm_funis
    where empresa_id = v_empresa and padrao = true
    limit 1;
  end if;

  if v_target_funil is null then
    return jsonb_build_object('funil_id', null, 'etapas', '[]'::jsonb);
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'nome', e.nome,
      'ordem', e.ordem,
      'cor', e.cor,
      'probabilidade', e.probabilidade,
      'oportunidades', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'titulo', o.titulo,
            'valor', o.valor,
            'cliente_id', o.cliente_id,
            'cliente_nome', p.nome,
            'status', o.status,
            'prioridade', o.prioridade,
            'data_fechamento', o.data_fechamento,
            'etapa_id', o.etapa_id,
            'funil_id', o.funil_id,
            'observacoes', o.observacoes
          )
          order by o.updated_at desc, o.id
        ), '[]'::jsonb)
        from public.crm_oportunidades o
        left join public.pessoas p on p.id = o.cliente_id
        where o.etapa_id = e.id
          and o.empresa_id = v_empresa
          and o.status = 'aberto'
      )
    )
    order by e.ordem, e.id
  )
  into v_result
  from public.crm_etapas e
  where e.funil_id = v_target_funil
    and e.empresa_id = v_empresa;

  return jsonb_build_object('funil_id', v_target_funil, 'etapas', coalesce(v_result, '[]'::jsonb));
end;
$$;
revoke all on function public.crm_get_kanban_data(uuid) from public;
grant execute on function public.crm_get_kanban_data(uuid) to authenticated, service_role;

-- 5.3 Mover oportunidade (com validação de funil/empresa)
create or replace function public.crm_move_oportunidade(
  p_oportunidade_id uuid,
  p_nova_etapa_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_funil_atual uuid;
  v_funil_dest  uuid;
begin
  -- funil da oportunidade
  select funil_id into v_funil_atual
  from public.crm_oportunidades
  where id = p_oportunidade_id
    and empresa_id = v_empresa;

  if v_funil_atual is null then
    raise exception 'Oportunidade não encontrada.';
  end if;

  -- valida etapa destino pertence ao mesmo funil/empresa
  select funil_id into v_funil_dest
  from public.crm_etapas
  where id = p_nova_etapa_id
    and empresa_id = v_empresa;

  if v_funil_dest is null then
    raise exception 'Etapa destino não encontrada para a empresa.';
  end if;

  if v_funil_dest <> v_funil_atual then
    raise exception 'Etapa destino pertence a outro funil.';
  end if;

  update public.crm_oportunidades
  set etapa_id = p_nova_etapa_id, updated_at = now()
  where id = p_oportunidade_id
    and empresa_id = v_empresa;

  perform pg_notify('app_log','[RPC] crm_move_oportunidade op='||p_oportunidade_id||' etapa='||p_nova_etapa_id);
end;
$$;
revoke all on function public.crm_move_oportunidade(uuid,uuid) from public;
grant execute on function public.crm_move_oportunidade(uuid,uuid) to authenticated, service_role;

-- 5.4 Upsert oportunidade (valida funil/etapa)
create or replace function public.crm_upsert_oportunidade(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_funil uuid;
  v_etapa uuid;
begin
  v_funil := (p_payload->>'funil_id')::uuid;
  v_etapa := (p_payload->>'etapa_id')::uuid;

  if p_payload->>'id' is null then
    -- valida funil/etapa para insert
    if v_funil is null or v_etapa is null then
      raise exception 'funil_id e etapa_id são obrigatórios.';
    end if;

    if not exists (
      select 1 from public.crm_funis f
      where f.id = v_funil and f.empresa_id = v_empresa
    ) then
      raise exception 'Funil inválido para a empresa.';
    end if;

    if not exists (
      select 1 from public.crm_etapas e
      where e.id = v_etapa and e.empresa_id = v_empresa and e.funil_id = v_funil
    ) then
      raise exception 'Etapa inválida para o funil/empresa.';
    end if;

    insert into public.crm_oportunidades (
      empresa_id, funil_id, etapa_id, titulo, valor, cliente_id,
      data_fechamento, prioridade, observacoes, status, origem, responsavel_id
    ) values (
      v_empresa,
      v_funil,
      v_etapa,
      p_payload->>'titulo',
      coalesce((p_payload->>'valor')::numeric, 0),
      (p_payload->>'cliente_id')::uuid,
      (p_payload->>'data_fechamento')::date,
      coalesce(p_payload->>'prioridade', 'media'),
      p_payload->>'observacoes',
      'aberto',
      p_payload->>'origem',
      (p_payload->>'responsavel_id')::uuid
    )
    returning id into v_id;
  else
    -- update: mantém coerência de empresa
    update public.crm_oportunidades
    set
      titulo          = coalesce(p_payload->>'titulo', titulo),
      valor           = coalesce((p_payload->>'valor')::numeric, valor),
      cliente_id      = coalesce((p_payload->>'cliente_id')::uuid, cliente_id),
      data_fechamento = coalesce((p_payload->>'data_fechamento')::date, data_fechamento),
      prioridade      = coalesce(p_payload->>'prioridade', prioridade),
      observacoes     = coalesce(p_payload->>'observacoes', observacoes),
      status          = coalesce(p_payload->>'status', status),
      origem          = coalesce(p_payload->>'origem', origem),
      responsavel_id  = coalesce((p_payload->>'responsavel_id')::uuid, responsavel_id),
      updated_at      = now()
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Oportunidade não encontrada.';
    end if;

    -- opcional: permitir troca de etapa/funil com validação (quando vier no payload)
    if v_etapa is not null then
      perform public.crm_move_oportunidade(v_id, v_etapa);
    end if;
  end if;

  perform pg_notify('app_log','[RPC] crm_upsert_oportunidade id='||v_id);
  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function public.crm_upsert_oportunidade(jsonb) from public;
grant execute on function public.crm_upsert_oportunidade(jsonb) to authenticated, service_role;

-- 5.5 Delete
create or replace function public.crm_delete_oportunidade(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.crm_oportunidades
  where id = p_id and empresa_id = public.current_empresa_id();
  perform pg_notify('app_log','[RPC] crm_delete_oportunidade id='||p_id);
end;
$$;
revoke all on function public.crm_delete_oportunidade(uuid) from public;
grant execute on function public.crm_delete_oportunidade(uuid) to authenticated, service_role;
