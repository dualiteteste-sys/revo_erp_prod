/*
  # CRM - Gestão de Oportunidades (Funil de Vendas)

  ## Estrutura
  - crm_funis: Pipelines de venda (ex: "Vendas Padrão", "Parcerias").
  - crm_etapas: Estágios do funil (ex: "Prospecção", "Proposta", "Fechamento").
  - crm_oportunidades: Os negócios em si.

  ## Features
  - Multi-tenant (empresa_id).
  - RLS completo.
  - RPCs para gestão ágil (Kanban).
*/

-- 1. Tabelas
create table if not exists public.crm_funis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  nome text not null,
  descricao text,
  padrao boolean default false,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  constraint crm_funis_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade
);

create table if not exists public.crm_etapas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  funil_id uuid not null,
  nome text not null,
  ordem int not null default 0,
  cor text, -- hex code ou classe tailwind
  probabilidade int default 0, -- % de chance de fechamento
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint crm_etapas_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint crm_etapas_funil_fkey foreign key (funil_id) references public.crm_funis(id) on delete cascade
);

create table if not exists public.crm_oportunidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  funil_id uuid not null,
  etapa_id uuid not null,
  cliente_id uuid, -- opcional, link com pessoas
  titulo text not null,
  valor numeric(15,2) default 0,
  data_fechamento date,
  status text default 'aberto' check (status in ('aberto', 'ganho', 'perdido')),
  prioridade text default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  origem text, -- ex: 'site', 'indicacao', 'telefone'
  observacoes text,
  responsavel_id uuid, -- usuario responsavel
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint crm_oportunidades_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint crm_oportunidades_funil_fkey foreign key (funil_id) references public.crm_funis(id) on delete cascade,
  constraint crm_oportunidades_etapa_fkey foreign key (etapa_id) references public.crm_etapas(id) on delete cascade,
  constraint crm_oportunidades_cliente_fkey foreign key (cliente_id) references public.pessoas(id) on delete set null
);

-- Índices
create index if not exists idx_crm_etapas_funil on public.crm_etapas(funil_id, ordem);
create index if not exists idx_crm_oportunidades_etapa on public.crm_oportunidades(etapa_id);
create index if not exists idx_crm_oportunidades_empresa on public.crm_oportunidades(empresa_id);

-- Triggers Updated At
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_crm_funis') then
    create trigger handle_updated_at_crm_funis before update on public.crm_funis for each row execute procedure public.tg_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_crm_etapas') then
    create trigger handle_updated_at_crm_etapas before update on public.crm_etapas for each row execute procedure public.tg_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_crm_oportunidades') then
    create trigger handle_updated_at_crm_oportunidades before update on public.crm_oportunidades for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.crm_funis enable row level security;
alter table public.crm_etapas enable row level security;
alter table public.crm_oportunidades enable row level security;

create policy "crm_funis_all" on public.crm_funis for all using (empresa_id = public.current_empresa_id());
create policy "crm_etapas_all" on public.crm_etapas for all using (empresa_id = public.current_empresa_id());
create policy "crm_oportunidades_all" on public.crm_oportunidades for all using (empresa_id = public.current_empresa_id());

-- 2. RPCs

-- 2.1 Seed Padrão (Cria funil se não existir)
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
  -- Verifica se já existe algum funil
  select id into v_funil_id from public.crm_funis where empresa_id = v_empresa and padrao = true limit 1;
  
  if v_funil_id is null then
    -- Cria funil padrão
    insert into public.crm_funis (empresa_id, nome, descricao, padrao, ativo)
    values (v_empresa, 'Funil de Vendas Padrão', 'Processo de vendas geral', true, true)
    returning id into v_funil_id;

    -- Cria etapas padrão
    insert into public.crm_etapas (empresa_id, funil_id, nome, ordem, cor, probabilidade) values
    (v_empresa, v_funil_id, 'Prospecção', 1, 'bg-gray-100', 10),
    (v_empresa, v_funil_id, 'Qualificação', 2, 'bg-blue-100', 30),
    (v_empresa, v_funil_id, 'Proposta', 3, 'bg-yellow-100', 60),
    (v_empresa, v_funil_id, 'Negociação', 4, 'bg-orange-100', 80),
    (v_empresa, v_funil_id, 'Fechado Ganho', 5, 'bg-green-100', 100);
  end if;

  return jsonb_build_object('funil_id', v_funil_id);
end;
$$;
grant execute on function public.crm_ensure_default_pipeline to authenticated, service_role;

-- 2.2 Listar Etapas com Oportunidades (Kanban View)
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
  -- Se não passou ID, pega o padrão
  if v_target_funil is null then
    select id into v_target_funil from public.crm_funis where empresa_id = v_empresa and padrao = true limit 1;
  end if;

  if v_target_funil is null then
    return null; -- Nenhum funil existe
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
            'data_fechamento', o.data_fechamento
          ) order by o.updated_at desc
        ), '[]'::jsonb)
        from public.crm_oportunidades o
        left join public.pessoas p on p.id = o.cliente_id
        where o.etapa_id = e.id 
          and o.empresa_id = v_empresa 
          and o.status = 'aberto' -- Kanban foca em abertos, ganhos/perdidos podem ser arquivados ou filtrados
      )
    ) order by e.ordem
  )
  into v_result
  from public.crm_etapas e
  where e.funil_id = v_target_funil
    and e.empresa_id = v_empresa;

  return jsonb_build_object(
    'funil_id', v_target_funil,
    'etapas', coalesce(v_result, '[]'::jsonb)
  );
end;
$$;
grant execute on function public.crm_get_kanban_data to authenticated, service_role;

-- 2.3 Mover Oportunidade (Drag & Drop)
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
begin
  update public.crm_oportunidades
  set etapa_id = p_nova_etapa_id, updated_at = now()
  where id = p_oportunidade_id and empresa_id = v_empresa;
end;
$$;
grant execute on function public.crm_move_oportunidade to authenticated, service_role;

-- 2.4 Upsert Oportunidade
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
begin
  if p_payload->>'id' is not null then
    update public.crm_oportunidades set
      titulo = p_payload->>'titulo',
      valor = coalesce((p_payload->>'valor')::numeric, 0),
      cliente_id = (p_payload->>'cliente_id')::uuid,
      data_fechamento = (p_payload->>'data_fechamento')::date,
      prioridade = coalesce(p_payload->>'prioridade', 'media'),
      observacoes = p_payload->>'observacoes',
      status = coalesce(p_payload->>'status', status),
      updated_at = now()
    where id = (p_payload->>'id')::uuid and empresa_id = v_empresa
    returning id into v_id;
  else
    insert into public.crm_oportunidades (
      empresa_id, funil_id, etapa_id, titulo, valor, cliente_id, 
      data_fechamento, prioridade, observacoes, status
    ) values (
      v_empresa,
      (p_payload->>'funil_id')::uuid,
      (p_payload->>'etapa_id')::uuid,
      p_payload->>'titulo',
      coalesce((p_payload->>'valor')::numeric, 0),
      (p_payload->>'cliente_id')::uuid,
      (p_payload->>'data_fechamento')::date,
      coalesce(p_payload->>'prioridade', 'media'),
      p_payload->>'observacoes',
      'aberto'
    )
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;
grant execute on function public.crm_upsert_oportunidade to authenticated, service_role;

-- 2.5 Delete Oportunidade
create or replace function public.crm_delete_oportunidade(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.crm_oportunidades 
  where id = p_id and empresa_id = public.current_empresa_id();
end;
$$;
grant execute on function public.crm_delete_oportunidade to authenticated, service_role;
