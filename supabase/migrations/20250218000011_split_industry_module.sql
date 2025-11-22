/*
  # Indústria - Separação de Módulos: Produção e Beneficiamento

  ## Query Description
  Refatora o módulo de indústria, separando-o em duas estruturas distintas:
  1. Produção (Industrialização): Foco em transformar insumos em produto final.
  2. Beneficiamento: Foco em serviços sobre material de terceiros.

  ## Impact Summary
  - Segurança:
    - RLS ativa em todas as novas tabelas (industria_producao_*, industria_benef_*).
    - RPCs SECURITY DEFINER com search_path restrito.
    - Filtros explícitos por empresa_id.
  - Compatibilidade:
    - Cria novas tabelas. As tabelas antigas (industria_ordens*) permanecem mas são depreciadas.
    - Drops de funções antigas para evitar conflitos de assinatura.
  - Reversibilidade:
    - Novos objetos podem ser dropados.
  - Performance:
    - Índices criados para chaves estrangeiras e colunas de status/busca.
*/

-- =============================================
-- 0. Limpeza de funções legadas (Regra 14)
-- =============================================
-- Removemos as funções do módulo "unificado" anterior para evitar confusão
drop function if exists public.industria_list_ordens(text, text, text, int, int);
drop function if exists public.industria_get_ordem_details(uuid);
drop function if exists public.industria_upsert_ordem(jsonb);
drop function if exists public.industria_manage_componente(uuid, uuid, uuid, numeric, text, text);
drop function if exists public.industria_manage_entrega(uuid, uuid, date, numeric, text, text, text, text);
drop function if exists public.industria_update_ordem_status(uuid, text, int);
drop function if exists public.industria_get_dashboard_stats();

-- =============================================
-- 1. MÓDULO PRODUÇÃO (Industrialização)
-- =============================================

-- 1.1 Tabelas
create table if not exists public.industria_producao_ordens (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  numero serial,
  origem_ordem text default 'manual' check (origem_ordem in ('manual', 'venda', 'reposicao', 'mrp')),
  produto_final_id uuid not null,
  quantidade_planejada numeric(15,4) not null check (quantidade_planejada > 0),
  unidade text not null,
  status text not null default 'rascunho' 
    check (status in ('rascunho', 'planejada', 'em_programacao', 'em_producao', 'em_inspecao', 'concluida', 'cancelada')),
  prioridade int not null default 0,
  data_prevista_inicio date,
  data_prevista_fim date,
  data_prevista_entrega date,
  recurso_principal_id uuid,
  documento_ref text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint ind_prod_ordens_pkey primary key (id),
  constraint ind_prod_ordens_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint ind_prod_ordens_produto_fkey foreign key (produto_final_id) references public.produtos(id)
);

create table if not exists public.industria_producao_componentes (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  ordem_id uuid not null,
  produto_id uuid not null,
  quantidade_planejada numeric(15,4) not null default 0,
  quantidade_consumida numeric(15,4) not null default 0,
  unidade text not null,
  origem text not null default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint ind_prod_comp_pkey primary key (id),
  constraint ind_prod_comp_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint ind_prod_comp_ordem_fkey foreign key (ordem_id) references public.industria_producao_ordens(id) on delete cascade,
  constraint ind_prod_comp_produto_fkey foreign key (produto_id) references public.produtos(id)
);

create table if not exists public.industria_producao_entregas (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  ordem_id uuid not null,
  data_entrega date not null default current_date,
  quantidade_entregue numeric(15,4) not null check (quantidade_entregue > 0),
  status_integracao text not null default 'nao_integrado',
  documento_ref text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint ind_prod_entregas_pkey primary key (id),
  constraint ind_prod_entregas_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint ind_prod_entregas_ordem_fkey foreign key (ordem_id) references public.industria_producao_ordens(id) on delete cascade
);

-- 1.2 Índices e Triggers
create index if not exists idx_ind_prod_ordens_empresa on public.industria_producao_ordens(empresa_id);
create index if not exists idx_ind_prod_ordens_status on public.industria_producao_ordens(status);
create index if not exists idx_ind_prod_comp_ordem on public.industria_producao_componentes(ordem_id);
create index if not exists idx_ind_prod_entregas_ordem on public.industria_producao_entregas(ordem_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_ind_prod_ordens'
      and tgrelid = 'public.industria_producao_ordens'::regclass
  ) then
    create trigger handle_updated_at_ind_prod_ordens
      before update on public.industria_producao_ordens
      for each row execute procedure public.tg_set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_ind_prod_comp'
      and tgrelid = 'public.industria_producao_componentes'::regclass
  ) then
    create trigger handle_updated_at_ind_prod_comp
      before update on public.industria_producao_componentes
      for each row execute procedure public.tg_set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_ind_prod_entregas'
      and tgrelid = 'public.industria_producao_entregas'::regclass
  ) then
    create trigger handle_updated_at_ind_prod_entregas
      before update on public.industria_producao_entregas
      for each row execute procedure public.tg_set_updated_at();
  end if;
end $$;

-- 1.3 RLS (por operação)
alter table public.industria_producao_ordens enable row level security;
alter table public.industria_producao_componentes enable row level security;
alter table public.industria_producao_entregas enable row level security;

-- industria_producao_ordens
drop policy if exists "ind_prod_ordens_select" on public.industria_producao_ordens;
drop policy if exists "ind_prod_ordens_insert" on public.industria_producao_ordens;
drop policy if exists "ind_prod_ordens_update" on public.industria_producao_ordens;
drop policy if exists "ind_prod_ordens_delete" on public.industria_producao_ordens;
drop policy if exists "ind_prod_ordens_all"    on public.industria_producao_ordens;

create policy "ind_prod_ordens_select"
  on public.industria_producao_ordens
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_prod_ordens_insert"
  on public.industria_producao_ordens
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_prod_ordens_update"
  on public.industria_producao_ordens
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_prod_ordens_delete"
  on public.industria_producao_ordens
  for delete
  using (empresa_id = public.current_empresa_id());

-- industria_producao_componentes
drop policy if exists "ind_prod_comp_select" on public.industria_producao_componentes;
drop policy if exists "ind_prod_comp_insert" on public.industria_producao_componentes;
drop policy if exists "ind_prod_comp_update" on public.industria_producao_componentes;
drop policy if exists "ind_prod_comp_delete" on public.industria_producao_componentes;
drop policy if exists "ind_prod_comp_all"    on public.industria_producao_componentes;

create policy "ind_prod_comp_select"
  on public.industria_producao_componentes
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_prod_comp_insert"
  on public.industria_producao_componentes
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_prod_comp_update"
  on public.industria_producao_componentes
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_prod_comp_delete"
  on public.industria_producao_componentes
  for delete
  using (empresa_id = public.current_empresa_id());

-- industria_producao_entregas
drop policy if exists "ind_prod_entregas_select" on public.industria_producao_entregas;
drop policy if exists "ind_prod_entregas_insert" on public.industria_producao_entregas;
drop policy if exists "ind_prod_entregas_update" on public.industria_producao_entregas;
drop policy if exists "ind_prod_entregas_delete" on public.industria_producao_entregas;
drop policy if exists "ind_prod_entregas_all"    on public.industria_producao_entregas;

create policy "ind_prod_entregas_select"
  on public.industria_producao_entregas
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_prod_entregas_insert"
  on public.industria_producao_entregas
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_prod_entregas_update"
  on public.industria_producao_entregas
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_prod_entregas_delete"
  on public.industria_producao_entregas
  for delete
  using (empresa_id = public.current_empresa_id());

-- 1.4 RPCs Produção

-- Listar Ordens
create or replace function public.industria_producao_list_ordens(
  p_search text default null,
  p_status text default null,
  p_limit  int   default 50,
  p_offset int   default 0
)
returns table (
  id                   uuid,
  numero               int,
  produto_nome         text,
  quantidade_planejada numeric,
  unidade              text,
  status               text,
  prioridade           int,
  data_prevista_entrega date,
  total_entregue       numeric,
  percentual_concluido numeric
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
    o.id,
    o.numero,
    p.nome as produto_nome,
    o.quantidade_planejada,
    o.unidade,
    o.status,
    o.prioridade,
    o.data_prevista_entrega,
    coalesce(sum(e.quantidade_entregue), 0) as total_entregue,
    case 
      when o.quantidade_planejada > 0 then 
        round((coalesce(sum(e.quantidade_entregue), 0) / o.quantidade_planejada) * 100, 2)
      else 0 
    end as percentual_concluido
  from public.industria_producao_ordens o
  join public.produtos p
    on o.produto_final_id = p.id
  left join public.industria_producao_entregas e
    on e.ordem_id = o.id
   and e.empresa_id = v_empresa_id
  where o.empresa_id = v_empresa_id
    and (
      p_search is null
      or o.numero::text ilike '%' || p_search || '%'
      or p.nome          ilike '%' || p_search || '%'
    )
    and (p_status is null or o.status = p_status)
  group by o.id, p.nome
  order by
    o.prioridade           desc,
    o.data_prevista_entrega asc nulls last,
    o.created_at           desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_producao_list_ordens from public;
grant execute on function public.industria_producao_list_ordens to authenticated, service_role;

-- Detalhes da Ordem
create or replace function public.industria_producao_get_ordem_details(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id  uuid := public.current_empresa_id();
  v_ordem       jsonb;
  v_componentes jsonb;
  v_entregas    jsonb;
begin
  select
    to_jsonb(o.*)
    || jsonb_build_object('produto_nome', p.nome)
  into v_ordem
  from public.industria_producao_ordens o
  join public.produtos p
    on o.produto_final_id = p.id
  where o.id = p_id
    and o.empresa_id = v_empresa_id;

  if v_ordem is null then
    return null;
  end if;

  select jsonb_agg(
           to_jsonb(c.*)
           || jsonb_build_object('produto_nome', p.nome)
         )
  into v_componentes
  from public.industria_producao_componentes c
  join public.produtos p
    on c.produto_id = p.id
  where c.ordem_id   = p_id
    and c.empresa_id = v_empresa_id;

  select jsonb_agg(
           to_jsonb(e.*)
           order by e.data_entrega desc, e.created_at desc
         )
  into v_entregas
  from public.industria_producao_entregas e
  where e.ordem_id   = p_id
    and e.empresa_id = v_empresa_id;

  return v_ordem
         || jsonb_build_object(
              'componentes', coalesce(v_componentes, '[]'::jsonb),
              'entregas',    coalesce(v_entregas,    '[]'::jsonb)
            );
end;
$$;

revoke all on function public.industria_producao_get_ordem_details from public;
grant execute on function public.industria_producao_get_ordem_details to authenticated, service_role;

-- Upsert Ordem
create or replace function public.industria_producao_upsert_ordem(
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
    update public.industria_producao_ordens
    set
      origem_ordem         = coalesce(p_payload->>'origem_ordem', 'manual'),
      produto_final_id     = (p_payload->>'produto_final_id')::uuid,
      quantidade_planejada = (p_payload->>'quantidade_planejada')::numeric,
      unidade              = p_payload->>'unidade',
      status               = coalesce(p_payload->>'status', 'rascunho'),
      prioridade           = coalesce((p_payload->>'prioridade')::int, 0),
      data_prevista_inicio = (p_payload->>'data_prevista_inicio')::date,
      data_prevista_fim    = (p_payload->>'data_prevista_fim')::date,
      data_prevista_entrega = (p_payload->>'data_prevista_entrega')::date,
      documento_ref        = p_payload->>'documento_ref',
      observacoes          = p_payload->>'observacoes'
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_producao_ordens (
      empresa_id,
      origem_ordem,
      produto_final_id,
      quantidade_planejada,
      unidade,
      status,
      prioridade,
      data_prevista_inicio,
      data_prevista_fim,
      data_prevista_entrega,
      documento_ref,
      observacoes
    ) values (
      v_empresa_id,
      coalesce(p_payload->>'origem_ordem', 'manual'),
      (p_payload->>'produto_final_id')::uuid,
      (p_payload->>'quantidade_planejada')::numeric,
      p_payload->>'unidade',
      coalesce(p_payload->>'status', 'rascunho'),
      coalesce((p_payload->>'prioridade')::int, 0),
      (p_payload->>'data_prevista_inicio')::date,
      (p_payload->>'data_prevista_fim')::date,
      (p_payload->>'data_prevista_entrega')::date,
      p_payload->>'documento_ref',
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] industria_producao_upsert_ordem: ' || v_id);
  return public.industria_producao_get_ordem_details(v_id);
end;
$$;

revoke all on function public.industria_producao_upsert_ordem from public;
grant execute on function public.industria_producao_upsert_ordem to authenticated, service_role;

-- Manage Componente
create or replace function public.industria_producao_manage_componente(
  p_ordem_id             uuid,
  p_componente_id        uuid,   -- null se insert
  p_produto_id           uuid,
  p_quantidade_planejada numeric,
  p_unidade              text,
  p_action               text    -- 'upsert' ou 'delete'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if not exists (
    select 1
    from public.industria_producao_ordens o
    where o.id = p_ordem_id
      and o.empresa_id = v_empresa_id
  ) then
    raise exception 'Ordem não encontrada.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_producao_componentes
    where id = p_componente_id
      and empresa_id = v_empresa_id;
  else
    if p_componente_id is not null then
      update public.industria_producao_componentes
      set
        produto_id           = p_produto_id,
        quantidade_planejada = p_quantidade_planejada,
        unidade              = p_unidade
      where id = p_componente_id
        and empresa_id = v_empresa_id;
    else
      insert into public.industria_producao_componentes (
        empresa_id,
        ordem_id,
        produto_id,
        quantidade_planejada,
        unidade
      ) values (
        v_empresa_id,
        p_ordem_id,
        p_produto_id,
        p_quantidade_planejada,
        p_unidade
      );
    end if;
  end if;
end;
$$;

revoke all on function public.industria_producao_manage_componente from public;
grant execute on function public.industria_producao_manage_componente to authenticated, service_role;

-- Manage Entrega
create or replace function public.industria_producao_manage_entrega(
  p_ordem_id            uuid,
  p_entrega_id          uuid,   -- null se insert
  p_data_entrega        date,
  p_quantidade_entregue numeric,
  p_documento_ref       text,
  p_observacoes         text,
  p_action              text    -- 'upsert' ou 'delete'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id     uuid   := public.current_empresa_id();
  v_qtd_planejada  numeric;
  v_total_entregue numeric;
begin
  select o.quantidade_planejada
  into v_qtd_planejada
  from public.industria_producao_ordens o
  where o.id = p_ordem_id
    and o.empresa_id = v_empresa_id;

  if v_qtd_planejada is null then
    raise exception 'Ordem não encontrada.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_producao_entregas
    where id = p_entrega_id
      and empresa_id = v_empresa_id;
  else
    select coalesce(sum(quantidade_entregue), 0)
    into v_total_entregue
    from public.industria_producao_entregas e
    where e.ordem_id   = p_ordem_id
      and e.empresa_id = v_empresa_id
      and (p_entrega_id is null or e.id <> p_entrega_id);

    if (v_total_entregue + p_quantidade_entregue) > v_qtd_planejada then
      raise exception 'Quantidade excede o planejado.';
    end if;

    if p_entrega_id is not null then
      update public.industria_producao_entregas
      set
        data_entrega        = p_data_entrega,
        quantidade_entregue = p_quantidade_entregue,
        documento_ref       = p_documento_ref,
        observacoes         = p_observacoes
      where id = p_entrega_id
        and empresa_id = v_empresa_id;
    else
      insert into public.industria_producao_entregas (
        empresa_id,
        ordem_id,
        data_entrega,
        quantidade_entregue,
        documento_ref,
        observacoes
      ) values (
        v_empresa_id,
        p_ordem_id,
        p_data_entrega,
        p_quantidade_entregue,
        p_documento_ref,
        p_observacoes
      );
    end if;
  end if;

  perform pg_notify('app_log', '[RPC] industria_producao_manage_entrega: ' || p_ordem_id);
end;
$$;

revoke all on function public.industria_producao_manage_entrega from public;
grant execute on function public.industria_producao_manage_entrega to authenticated, service_role;

-- Update Status (Kanban)
create or replace function public.industria_producao_update_status(
  p_id         uuid,
  p_status     text,
  p_prioridade int
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  update public.industria_producao_ordens
  set
    status     = p_status,
    prioridade = p_prioridade
  where id = p_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Ordem não encontrada ou acesso negado.';
  end if;

  perform pg_notify('app_log', '[RPC] industria_producao_update_status: ' || p_id);
end;
$$;

revoke all on function public.industria_producao_update_status from public;
grant execute on function public.industria_producao_update_status to authenticated, service_role;

-- =============================================
-- 2. MÓDULO BENEFICIAMENTO
-- =============================================

-- 2.1 Tabelas
create table if not exists public.industria_benef_ordens (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  numero serial,
  cliente_id uuid not null,
  produto_servico_id uuid not null,
  produto_material_cliente_id uuid,
  usa_material_cliente boolean default true,
  quantidade_planejada numeric(15,4) not null check (quantidade_planejada > 0),
  unidade text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'aguardando_material', 'em_beneficiamento', 'em_inspecao', 'parcialmente_entregue', 'concluida', 'cancelada')),
  prioridade int not null default 0,
  data_prevista_entrega date,
  pedido_cliente_ref text,
  lote_cliente text,
  documento_ref text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint ind_benef_ordens_pkey primary key (id),
  constraint ind_benef_ordens_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint ind_benef_ordens_cliente_fkey foreign key (cliente_id) references public.pessoas(id),
  constraint ind_benef_ordens_prod_serv_fkey foreign key (produto_servico_id) references public.produtos(id),
  constraint ind_benef_ordens_prod_mat_fkey foreign key (produto_material_cliente_id) references public.produtos(id)
);

create table if not exists public.industria_benef_componentes (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  ordem_id uuid not null,
  produto_id uuid not null,
  quantidade_planejada numeric(15,4) not null default 0,
  quantidade_consumida numeric(15,4) not null default 0,
  unidade text not null,
  origem text not null default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint ind_benef_comp_pkey primary key (id),
  constraint ind_benef_comp_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint ind_benef_comp_ordem_fkey foreign key (ordem_id) references public.industria_benef_ordens(id) on delete cascade,
  constraint ind_benef_comp_produto_fkey foreign key (produto_id) references public.produtos(id)
);

create table if not exists public.industria_benef_entregas (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  ordem_id uuid not null,
  data_entrega date not null default current_date,
  quantidade_entregue numeric(15,4) not null check (quantidade_entregue > 0),
  status_faturamento text not null default 'nao_faturado'
    check (status_faturamento in ('nao_faturado', 'pronto_para_faturar', 'faturado')),
  documento_entrega text,
  documento_faturamento text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint ind_benef_entregas_pkey primary key (id),
  constraint ind_benef_entregas_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint ind_benef_entregas_ordem_fkey foreign key (ordem_id) references public.industria_benef_ordens(id) on delete cascade
);

-- 2.2 Índices e Triggers
create index if not exists idx_ind_benef_ordens_empresa on public.industria_benef_ordens(empresa_id);
create index if not exists idx_ind_benef_ordens_status  on public.industria_benef_ordens(status);
create index if not exists idx_ind_benef_ordens_cliente on public.industria_benef_ordens(cliente_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_ind_benef_ordens'
      and tgrelid = 'public.industria_benef_ordens'::regclass
  ) then
    create trigger handle_updated_at_ind_benef_ordens
      before update on public.industria_benef_ordens
      for each row execute procedure public.tg_set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_ind_benef_comp'
      and tgrelid = 'public.industria_benef_componentes'::regclass
  ) then
    create trigger handle_updated_at_ind_benef_comp
      before update on public.industria_benef_componentes
      for each row execute procedure public.tg_set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_ind_benef_entregas'
      and tgrelid = 'public.industria_benef_entregas'::regclass
  ) then
    create trigger handle_updated_at_ind_benef_entregas
      before update on public.industria_benef_entregas
      for each row execute procedure public.tg_set_updated_at();
  end if;
end $$;

-- 2.3 RLS (por operação)
alter table public.industria_benef_ordens       enable row level security;
alter table public.industria_benef_componentes  enable row level security;
alter table public.industria_benef_entregas     enable row level security;

-- industria_benef_ordens
drop policy if exists "ind_benef_ordens_select" on public.industria_benef_ordens;
drop policy if exists "ind_benef_ordens_insert" on public.industria_benef_ordens;
drop policy if exists "ind_benef_ordens_update" on public.industria_benef_ordens;
drop policy if exists "ind_benef_ordens_delete" on public.industria_benef_ordens;
drop policy if exists "ind_benef_ordens_all"    on public.industria_benef_ordens;

create policy "ind_benef_ordens_select"
  on public.industria_benef_ordens
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_benef_ordens_insert"
  on public.industria_benef_ordens
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_benef_ordens_update"
  on public.industria_benef_ordens
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_benef_ordens_delete"
  on public.industria_benef_ordens
  for delete
  using (empresa_id = public.current_empresa_id());

-- industria_benef_componentes
drop policy if exists "ind_benef_comp_select" on public.industria_benef_componentes;
drop policy if exists "ind_benef_comp_insert" on public.industria_benef_componentes;
drop policy if exists "ind_benef_comp_update" on public.industria_benef_componentes;
drop policy if exists "ind_benef_comp_delete" on public.industria_benef_componentes;
drop policy if exists "ind_benef_comp_all"    on public.industria_benef_componentes;

create policy "ind_benef_comp_select"
  on public.industria_benef_componentes
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_benef_comp_insert"
  on public.industria_benef_componentes
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_benef_comp_update"
  on public.industria_benef_componentes
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_benef_comp_delete"
  on public.industria_benef_componentes
  for delete
  using (empresa_id = public.current_empresa_id());

-- industria_benef_entregas
drop policy if exists "ind_benef_entregas_select" on public.industria_benef_entregas;
drop policy if exists "ind_benef_entregas_insert" on public.industria_benef_entregas;
drop policy if exists "ind_benef_entregas_update" on public.industria_benef_entregas;
drop policy if exists "ind_benef_entregas_delete" on public.industria_benef_entregas;
drop policy if exists "ind_benef_entregas_all"    on public.industria_benef_entregas;

create policy "ind_benef_entregas_select"
  on public.industria_benef_entregas
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_benef_entregas_insert"
  on public.industria_benef_entregas
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_benef_entregas_update"
  on public.industria_benef_entregas
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_benef_entregas_delete"
  on public.industria_benef_entregas
  for delete
  using (empresa_id = public.current_empresa_id());

-- 2.4 RPCs Beneficiamento

-- Listar
create or replace function public.industria_benef_list_ordens(
  p_search     text default null,
  p_status     text default null,
  p_cliente_id uuid default null,
  p_limit      int  default 50,
  p_offset     int  default 0
)
returns table (
  id                   uuid,
  numero               int,
  cliente_nome         text,
  produto_servico_nome text,
  pedido_cliente_ref   text,
  quantidade_planejada numeric,
  unidade              text,
  status               text,
  prioridade           int,
  data_prevista_entrega date,
  total_entregue       numeric,
  percentual_concluido numeric
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
    o.id,
    o.numero,
    c.nome as cliente_nome,
    p.nome as produto_servico_nome,
    o.pedido_cliente_ref,
    o.quantidade_planejada,
    o.unidade,
    o.status,
    o.prioridade,
    o.data_prevista_entrega,
    coalesce(sum(e.quantidade_entregue), 0) as total_entregue,
    case 
      when o.quantidade_planejada > 0 then 
        round((coalesce(sum(e.quantidade_entregue), 0) / o.quantidade_planejada) * 100, 2)
      else 0 
    end as percentual_concluido
  from public.industria_benef_ordens o
  join public.pessoas  c on o.cliente_id        = c.id
  join public.produtos p on o.produto_servico_id = p.id
  left join public.industria_benef_entregas e
    on e.ordem_id   = o.id
   and e.empresa_id = v_empresa_id
  where o.empresa_id = v_empresa_id
    and (
      p_search is null
      or o.numero::text        ilike '%' || p_search || '%'
      or c.nome                ilike '%' || p_search || '%'
      or o.pedido_cliente_ref  ilike '%' || p_search || '%'
      or o.lote_cliente        ilike '%' || p_search || '%'
    )
    and (p_status     is null or o.status     = p_status)
    and (p_cliente_id is null or o.cliente_id = p_cliente_id)
  group by o.id, c.nome, p.nome
  order by
    o.prioridade           desc,
    o.data_prevista_entrega asc nulls last,
    o.created_at           desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_benef_list_ordens from public;
grant execute on function public.industria_benef_list_ordens to authenticated, service_role;

-- Detalhes
create or replace function public.industria_benef_get_ordem_details(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id  uuid := public.current_empresa_id();
  v_ordem       jsonb;
  v_componentes jsonb;
  v_entregas    jsonb;
begin
  select
    to_jsonb(o.*)
    || jsonb_build_object(
         'cliente_nome',          c.nome,
         'produto_servico_nome',  ps.nome,
         'produto_material_nome', pm.nome
       )
  into v_ordem
  from public.industria_benef_ordens o
  join public.pessoas  c  on o.cliente_id             = c.id
  join public.produtos ps on o.produto_servico_id     = ps.id
  left join public.produtos pm on o.produto_material_cliente_id = pm.id
  where o.id = p_id
    and o.empresa_id = v_empresa_id;

  if v_ordem is null then
    return null;
  end if;

  select jsonb_agg(
           to_jsonb(cmp.*)
           || jsonb_build_object('produto_nome', p.nome)
         )
  into v_componentes
  from public.industria_benef_componentes cmp
  join public.produtos p
    on cmp.produto_id = p.id
  where cmp.ordem_id   = p_id
    and cmp.empresa_id = v_empresa_id;

  select jsonb_agg(
           to_jsonb(e.*)
           order by e.data_entrega desc, e.created_at desc
         )
  into v_entregas
  from public.industria_benef_entregas e
  where e.ordem_id   = p_id
    and e.empresa_id = v_empresa_id;

  return v_ordem
         || jsonb_build_object(
              'componentes', coalesce(v_componentes, '[]'::jsonb),
              'entregas',    coalesce(v_entregas,    '[]'::jsonb)
            );
end;
$$;

revoke all on function public.industria_benef_get_ordem_details from public;
grant execute on function public.industria_benef_get_ordem_details to authenticated, service_role;

-- Upsert
create or replace function public.industria_benef_upsert_ordem(
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
    update public.industria_benef_ordens
    set
      cliente_id               = (p_payload->>'cliente_id')::uuid,
      produto_servico_id       = (p_payload->>'produto_servico_id')::uuid,
      produto_material_cliente_id = (p_payload->>'produto_material_cliente_id')::uuid,
      usa_material_cliente     = coalesce((p_payload->>'usa_material_cliente')::boolean, true),
      quantidade_planejada     = (p_payload->>'quantidade_planejada')::numeric,
      unidade                  = p_payload->>'unidade',
      status                   = coalesce(p_payload->>'status', 'rascunho'),
      prioridade               = coalesce((p_payload->>'prioridade')::int, 0),
      data_prevista_entrega    = (p_payload->>'data_prevista_entrega')::date,
      pedido_cliente_ref       = p_payload->>'pedido_cliente_ref',
      lote_cliente             = p_payload->>'lote_cliente',
      documento_ref            = p_payload->>'documento_ref',
      observacoes              = p_payload->>'observacoes'
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_benef_ordens (
      empresa_id,
      cliente_id,
      produto_servico_id,
      produto_material_cliente_id,
      usa_material_cliente,
      quantidade_planejada,
      unidade,
      status,
      prioridade,
      data_prevista_entrega,
      pedido_cliente_ref,
      lote_cliente,
      documento_ref,
      observacoes
    ) values (
      v_empresa_id,
      (p_payload->>'cliente_id')::uuid,
      (p_payload->>'produto_servico_id')::uuid,
      (p_payload->>'produto_material_cliente_id')::uuid,
      coalesce((p_payload->>'usa_material_cliente')::boolean, true),
      (p_payload->>'quantidade_planejada')::numeric,
      p_payload->>'unidade',
      coalesce(p_payload->>'status', 'rascunho'),
      coalesce((p_payload->>'prioridade')::int, 0),
      (p_payload->>'data_prevista_entrega')::date,
      p_payload->>'pedido_cliente_ref',
      p_payload->>'lote_cliente',
      p_payload->>'documento_ref',
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] industria_benef_upsert_ordem: ' || v_id);
  return public.industria_benef_get_ordem_details(v_id);
end;
$$;

revoke all on function public.industria_benef_upsert_ordem from public;
grant execute on function public.industria_benef_upsert_ordem to authenticated, service_role;

-- Manage Componente
create or replace function public.industria_benef_manage_componente(
  p_ordem_id             uuid,
  p_componente_id        uuid,   -- null se insert
  p_produto_id           uuid,
  p_quantidade_planejada numeric,
  p_unidade              text,
  p_action               text    -- 'upsert' ou 'delete'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if not exists (
    select 1
    from public.industria_benef_ordens o
    where o.id = p_ordem_id
      and o.empresa_id = v_empresa_id
  ) then
    raise exception 'Ordem não encontrada.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_benef_componentes
    where id = p_componente_id
      and empresa_id = v_empresa_id;
  else
    if p_componente_id is not null then
      update public.industria_benef_componentes
      set
        produto_id           = p_produto_id,
        quantidade_planejada = p_quantidade_planejada,
        unidade              = p_unidade
      where id = p_componente_id
        and empresa_id = v_empresa_id;
    else
      insert into public.industria_benef_componentes (
        empresa_id,
        ordem_id,
        produto_id,
        quantidade_planejada,
        unidade
      ) values (
        v_empresa_id,
        p_ordem_id,
        p_produto_id,
        p_quantidade_planejada,
        p_unidade
      );
    end if;
  end if;
end;
$$;

revoke all on function public.industria_benef_manage_componente from public;
grant execute on function public.industria_benef_manage_componente to authenticated, service_role;

-- Manage Entrega
create or replace function public.industria_benef_manage_entrega(
  p_ordem_id             uuid,
  p_entrega_id           uuid,   -- null se insert
  p_data_entrega         date,
  p_quantidade_entregue  numeric,
  p_status_faturamento   text,
  p_documento_entrega    text,
  p_documento_faturamento text,
  p_observacoes          text,
  p_action               text    -- 'upsert' ou 'delete'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id     uuid   := public.current_empresa_id();
  v_qtd_planejada  numeric;
  v_total_entregue numeric;
begin
  select o.quantidade_planejada
  into v_qtd_planejada
  from public.industria_benef_ordens o
  where o.id = p_ordem_id
    and o.empresa_id = v_empresa_id;

  if v_qtd_planejada is null then
    raise exception 'Ordem não encontrada.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_benef_entregas
    where id = p_entrega_id
      and empresa_id = v_empresa_id;
  else
    select coalesce(sum(quantidade_entregue), 0)
    into v_total_entregue
    from public.industria_benef_entregas e
    where e.ordem_id   = p_ordem_id
      and e.empresa_id = v_empresa_id
      and (p_entrega_id is null or e.id <> p_entrega_id);

    if (v_total_entregue + p_quantidade_entregue) > v_qtd_planejada then
      raise exception 'Quantidade excede o planejado.';
    end if;

    if p_entrega_id is not null then
      update public.industria_benef_entregas
      set
        data_entrega         = p_data_entrega,
        quantidade_entregue  = p_quantidade_entregue,
        status_faturamento   = p_status_faturamento,
        documento_entrega    = p_documento_entrega,
        documento_faturamento = p_documento_faturamento,
        observacoes          = p_observacoes
      where id = p_entrega_id
        and empresa_id = v_empresa_id;
    else
      insert into public.industria_benef_entregas (
        empresa_id,
        ordem_id,
        data_entrega,
        quantidade_entregue,
        status_faturamento,
        documento_entrega,
        documento_faturamento,
        observacoes
      ) values (
        v_empresa_id,
        p_ordem_id,
        p_data_entrega,
        p_quantidade_entregue,
        p_status_faturamento,
        p_documento_entrega,
        p_documento_faturamento,
        p_observacoes
      );
    end if;
  end if;

  perform pg_notify('app_log', '[RPC] industria_benef_manage_entrega: ' || p_ordem_id);
end;
$$;

revoke all on function public.industria_benef_manage_entrega from public;
grant execute on function public.industria_benef_manage_entrega to authenticated, service_role;

-- Update Status (Kanban)
create or replace function public.industria_benef_update_status(
  p_id         uuid,
  p_status     text,
  p_prioridade int
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  update public.industria_benef_ordens
  set
    status     = p_status,
    prioridade = p_prioridade
  where id = p_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Ordem não encontrada ou acesso negado.';
  end if;

  perform pg_notify('app_log', '[RPC] industria_benef_update_status: ' || p_id);
end;
$$;

revoke all on function public.industria_benef_update_status from public;
grant execute on function public.industria_benef_update_status to authenticated, service_role;

-- =============================================
-- 3. DASHBOARD UNIFICADO
-- =============================================
create or replace function public.industria_get_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id   uuid := public.current_empresa_id();
  v_prod_status  jsonb;
  v_benef_status jsonb;
  v_total_prod   numeric;
  v_total_benef  numeric;
begin
  select jsonb_agg(t)
  into v_prod_status
  from (
    select status, count(*) as total
    from public.industria_producao_ordens
    where empresa_id = v_empresa_id
    group by status
  ) t;

  select jsonb_agg(t)
  into v_benef_status
  from (
    select status, count(*) as total
    from public.industria_benef_ordens
    where empresa_id = v_empresa_id
    group by status
  ) t;

  select count(*)
  into v_total_prod
  from public.industria_producao_ordens
  where empresa_id = v_empresa_id;

  select count(*)
  into v_total_benef
  from public.industria_benef_ordens
  where empresa_id = v_empresa_id;

  return jsonb_build_object(
    'producao_status',        coalesce(v_prod_status,  '[]'::jsonb),
    'beneficiamento_status',  coalesce(v_benef_status, '[]'::jsonb),
    'total_producao',         coalesce(v_total_prod,   0),
    'total_beneficiamento',   coalesce(v_total_benef,  0)
  );
end;
$$;

revoke all on function public.industria_get_dashboard_stats from public;
grant execute on function public.industria_get_dashboard_stats to authenticated, service_role;
