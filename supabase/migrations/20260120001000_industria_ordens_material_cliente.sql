/*
  # Indústria - Beneficiamento: persistir Material do Cliente na Ordem (OP/OB)

  ## Objetivo
  - Permitir salvar/editar uma Ordem de Beneficiamento com vínculo explícito ao "Material do Cliente"
  - Habilitar UI moderna (autocomplete) mantendo consistência ao reabrir a ordem

  ## Observações
  - Alterações idempotentes (IF NOT EXISTS) sempre que possível.
  - RPCs são SECURITY DEFINER e search_path restrito.
*/

-- 0) Garantias mínimas (prod pode não ter o legado `industria_ordens`)
create schema if not exists public;

create table if not exists public.industria_ordens (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  numero serial,
  tipo_ordem text not null check (tipo_ordem in ('industrializacao', 'beneficiamento')),
  produto_final_id uuid not null,
  quantidade_planejada numeric(15,4) not null check (quantidade_planejada > 0),
  unidade text not null,
  cliente_id uuid,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'planejada', 'em_programacao', 'em_producao', 'em_inspecao', 'parcialmente_concluida', 'concluida', 'cancelada')),
  prioridade int not null default 0,
  data_prevista_inicio date,
  data_prevista_fim date,
  data_prevista_entrega date,
  recurso_principal_id uuid,
  documento_ref text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Beneficiamento
  usa_material_cliente boolean not null default false,
  material_cliente_id uuid,

  constraint industria_ordens_pkey primary key (id),
  constraint industria_ordens_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint industria_ordens_produto_fkey foreign key (produto_final_id) references public.produtos(id),
  constraint industria_ordens_cliente_fkey foreign key (cliente_id) references public.pessoas(id)
);

create table if not exists public.industria_ordens_componentes (
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

  constraint industria_componentes_pkey primary key (id),
  constraint industria_componentes_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint industria_componentes_ordem_fkey foreign key (ordem_id) references public.industria_ordens(id) on delete cascade,
  constraint industria_componentes_produto_fkey foreign key (produto_id) references public.produtos(id)
);

create table if not exists public.industria_ordens_entregas (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  ordem_id uuid not null,
  data_entrega date not null default current_date,
  quantidade_entregue numeric(15,4) not null check (quantidade_entregue > 0),
  status_faturamento text not null default 'nao_faturado'
    check (status_faturamento in ('nao_faturado', 'pronto_para_faturar', 'faturado')),
  documento_ref text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint industria_entregas_pkey primary key (id),
  constraint industria_entregas_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint industria_entregas_ordem_fkey foreign key (ordem_id) references public.industria_ordens(id) on delete cascade
);

create index if not exists idx_industria_ordens_empresa on public.industria_ordens(empresa_id);
create index if not exists idx_industria_ordens_status on public.industria_ordens(status);
create index if not exists idx_industria_ordens_produto on public.industria_ordens(produto_final_id);
create index if not exists idx_industria_ordens_cliente on public.industria_ordens(cliente_id);

create index if not exists idx_industria_comp_ordem on public.industria_ordens_componentes(ordem_id);
create index if not exists idx_industria_comp_empresa on public.industria_ordens_componentes(empresa_id);

create index if not exists idx_industria_entregas_ordem on public.industria_ordens_entregas(ordem_id);
create index if not exists idx_industria_entregas_empresa on public.industria_ordens_entregas(empresa_id);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'tg_set_updated_at' and pg_function_is_visible(oid)) then
    if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_industria_ordens' and tgrelid = 'public.industria_ordens'::regclass) then
      create trigger handle_updated_at_industria_ordens
        before update on public.industria_ordens
        for each row execute procedure public.tg_set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_industria_ordens_componentes' and tgrelid = 'public.industria_ordens_componentes'::regclass) then
      create trigger handle_updated_at_industria_ordens_componentes
        before update on public.industria_ordens_componentes
        for each row execute procedure public.tg_set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_industria_ordens_entregas' and tgrelid = 'public.industria_ordens_entregas'::regclass) then
      create trigger handle_updated_at_industria_ordens_entregas
        before update on public.industria_ordens_entregas
        for each row execute procedure public.tg_set_updated_at();
    end if;
  end if;
end;
$$;

alter table public.industria_ordens enable row level security;
alter table public.industria_ordens_componentes enable row level security;
alter table public.industria_ordens_entregas enable row level security;

drop policy if exists "industria_ordens_select" on public.industria_ordens;
drop policy if exists "industria_ordens_insert" on public.industria_ordens;
drop policy if exists "industria_ordens_update" on public.industria_ordens;
drop policy if exists "industria_ordens_delete" on public.industria_ordens;

create policy "industria_ordens_select"
  on public.industria_ordens
  for select
  using (empresa_id = public.current_empresa_id());

create policy "industria_ordens_insert"
  on public.industria_ordens
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "industria_ordens_update"
  on public.industria_ordens
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "industria_ordens_delete"
  on public.industria_ordens
  for delete
  using (empresa_id = public.current_empresa_id());

drop policy if exists "industria_comp_select" on public.industria_ordens_componentes;
drop policy if exists "industria_comp_insert" on public.industria_ordens_componentes;
drop policy if exists "industria_comp_update" on public.industria_ordens_componentes;
drop policy if exists "industria_comp_delete" on public.industria_ordens_componentes;

create policy "industria_comp_select"
  on public.industria_ordens_componentes
  for select
  using (empresa_id = public.current_empresa_id());

create policy "industria_comp_insert"
  on public.industria_ordens_componentes
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "industria_comp_update"
  on public.industria_ordens_componentes
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "industria_comp_delete"
  on public.industria_ordens_componentes
  for delete
  using (empresa_id = public.current_empresa_id());

drop policy if exists "industria_entregas_select" on public.industria_ordens_entregas;
drop policy if exists "industria_entregas_insert" on public.industria_ordens_entregas;
drop policy if exists "industria_entregas_update" on public.industria_ordens_entregas;
drop policy if exists "industria_entregas_delete" on public.industria_ordens_entregas;

create policy "industria_entregas_select"
  on public.industria_ordens_entregas
  for select
  using (empresa_id = public.current_empresa_id());

create policy "industria_entregas_insert"
  on public.industria_ordens_entregas
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "industria_entregas_update"
  on public.industria_ordens_entregas
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "industria_entregas_delete"
  on public.industria_ordens_entregas
  for delete
  using (empresa_id = public.current_empresa_id());

-- 1) Colunas adicionais na ordem (segurança para bases antigas)
alter table public.industria_ordens
  add column if not exists usa_material_cliente boolean not null default false,
  add column if not exists material_cliente_id uuid;

create index if not exists idx_industria_ordens_material_cliente
  on public.industria_ordens (material_cliente_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'industria_ordens_material_cliente_fkey'
      and conrelid = 'public.industria_ordens'::regclass
  ) then
    if to_regclass('public.industria_materiais_cliente') is not null then
      alter table public.industria_ordens
        add constraint industria_ordens_material_cliente_fkey
        foreign key (material_cliente_id)
        references public.industria_materiais_cliente (id);
    else
      raise notice 'Tabela public.industria_materiais_cliente não existe; pulando FK industria_ordens_material_cliente_fkey.';
    end if;
  end if;
end;
$$;

-- 2) RPCs base (OP/OB) + detalhes com material do cliente

create or replace function public.industria_list_ordens(
  p_search text default null,
  p_tipo   text default null,
  p_status text default null,
  p_limit  int   default 50,
  p_offset int   default 0
)
returns table (
  id                   uuid,
  numero               int,
  tipo_ordem           text,
  produto_nome         text,
  cliente_nome         text,
  quantidade_planejada numeric,
  unidade              text,
  status               text,
  prioridade           int,
  data_prevista_entrega date,
  total_entregue       numeric
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
    o.tipo_ordem,
    p.nome as produto_nome,
    c.nome as cliente_nome,
    o.quantidade_planejada,
    o.unidade,
    o.status,
    o.prioridade,
    o.data_prevista_entrega,
    coalesce((
      select sum(e.quantidade_entregue)
      from public.industria_ordens_entregas e
      where e.ordem_id = o.id
        and e.empresa_id = v_empresa_id
    ), 0) as total_entregue
  from public.industria_ordens o
  join public.produtos p
    on o.produto_final_id = p.id
  left join public.pessoas c
    on o.cliente_id = c.id
  where o.empresa_id = v_empresa_id
    and (
      p_search is null
      or o.numero::text ilike '%' || p_search || '%'
      or p.nome          ilike '%' || p_search || '%'
      or c.nome          ilike '%' || p_search || '%'
    )
    and (p_tipo is null   or o.tipo_ordem = p_tipo)
    and (p_status is null or o.status     = p_status)
  order by o.prioridade desc, o.data_prevista_entrega asc nulls last, o.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_list_ordens from public;
grant execute on function public.industria_list_ordens to authenticated, service_role;

create or replace function public.industria_get_ordem_details(
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
         'produto_nome', p.nome,
         'cliente_nome', c.nome,
         'material_cliente_nome', mc.nome_cliente,
         'material_cliente_codigo', mc.codigo_cliente,
         'material_cliente_unidade', mc.unidade
       )
  into v_ordem
  from public.industria_ordens o
  join public.produtos p
    on o.produto_final_id = p.id
  left join public.pessoas c
    on o.cliente_id = c.id
  left join public.industria_materiais_cliente mc
    on mc.id = o.material_cliente_id
   and mc.empresa_id = v_empresa_id
  where o.id = p_id
    and o.empresa_id = v_empresa_id;

  if v_ordem is null then
    return null;
  end if;

  select jsonb_agg(
           to_jsonb(comp.*)
           || jsonb_build_object('produto_nome', p2.nome)
         )
  into v_componentes
  from public.industria_ordens_componentes comp
  join public.produtos p2
    on comp.produto_id = p2.id
  where comp.ordem_id = p_id
    and comp.empresa_id = v_empresa_id;

  select jsonb_agg(
           to_jsonb(ent.*)
           order by ent.data_entrega desc, ent.created_at desc
         )
  into v_entregas
  from public.industria_ordens_entregas ent
  where ent.ordem_id = p_id
    and ent.empresa_id = v_empresa_id;

  return v_ordem
         || jsonb_build_object(
              'componentes', coalesce(v_componentes, '[]'::jsonb),
              'entregas',    coalesce(v_entregas,    '[]'::jsonb)
            );
end;
$$;

revoke all on function public.industria_get_ordem_details from public;
grant execute on function public.industria_get_ordem_details to authenticated, service_role;

create or replace function public.industria_upsert_ordem(
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
    update public.industria_ordens
    set
      tipo_ordem            = p_payload->>'tipo_ordem',
      produto_final_id      = (p_payload->>'produto_final_id')::uuid,
      quantidade_planejada  = (p_payload->>'quantidade_planejada')::numeric,
      unidade               = p_payload->>'unidade',
      cliente_id            = (p_payload->>'cliente_id')::uuid,
      status                = coalesce(p_payload->>'status', 'rascunho'),
      prioridade            = coalesce((p_payload->>'prioridade')::int, 0),
      data_prevista_inicio  = (p_payload->>'data_prevista_inicio')::date,
      data_prevista_fim     = (p_payload->>'data_prevista_fim')::date,
      data_prevista_entrega = (p_payload->>'data_prevista_entrega')::date,
      documento_ref         = p_payload->>'documento_ref',
      observacoes           = p_payload->>'observacoes',
      usa_material_cliente  = coalesce((p_payload->>'usa_material_cliente')::boolean, false),
      material_cliente_id   = (p_payload->>'material_cliente_id')::uuid
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_ordens (
      empresa_id,
      tipo_ordem,
      produto_final_id,
      quantidade_planejada,
      unidade,
      cliente_id,
      status,
      prioridade,
      data_prevista_inicio,
      data_prevista_fim,
      data_prevista_entrega,
      documento_ref,
      observacoes,
      usa_material_cliente,
      material_cliente_id
    ) values (
      v_empresa_id,
      p_payload->>'tipo_ordem',
      (p_payload->>'produto_final_id')::uuid,
      (p_payload->>'quantidade_planejada')::numeric,
      p_payload->>'unidade',
      (p_payload->>'cliente_id')::uuid,
      coalesce(p_payload->>'status', 'rascunho'),
      coalesce((p_payload->>'prioridade')::int, 0),
      (p_payload->>'data_prevista_inicio')::date,
      (p_payload->>'data_prevista_fim')::date,
      (p_payload->>'data_prevista_entrega')::date,
      p_payload->>'documento_ref',
      p_payload->>'observacoes',
      coalesce((p_payload->>'usa_material_cliente')::boolean, false),
      (p_payload->>'material_cliente_id')::uuid
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] industria_upsert_ordem: ' || v_id);
  return public.industria_get_ordem_details(v_id);
end;
$$;

revoke all on function public.industria_upsert_ordem from public;
grant execute on function public.industria_upsert_ordem to authenticated, service_role;

create or replace function public.industria_manage_componente(
  p_ordem_id              uuid,
  p_componente_id         uuid,
  p_produto_id            uuid,
  p_quantidade_planejada  numeric,
  p_unidade               text,
  p_action                text
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
    from public.industria_ordens o
    where o.id = p_ordem_id
      and o.empresa_id = v_empresa_id
  ) then
    raise exception 'Ordem não encontrada ou acesso negado.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_ordens_componentes
    where id = p_componente_id
      and empresa_id = v_empresa_id;
  else
    if p_componente_id is not null then
      update public.industria_ordens_componentes
      set
        produto_id           = p_produto_id,
        quantidade_planejada = p_quantidade_planejada,
        unidade              = p_unidade
      where id = p_componente_id
        and empresa_id = v_empresa_id;
    else
      insert into public.industria_ordens_componentes (
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

revoke all on function public.industria_manage_componente from public;
grant execute on function public.industria_manage_componente to authenticated, service_role;

create or replace function public.industria_manage_entrega(
  p_ordem_id              uuid,
  p_entrega_id            uuid,
  p_data_entrega          date,
  p_quantidade_entregue   numeric,
  p_status_faturamento    text,
  p_documento_ref         text,
  p_observacoes           text,
  p_action                text
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
    from public.industria_ordens o
    where o.id = p_ordem_id
      and o.empresa_id = v_empresa_id
  ) then
    raise exception 'Ordem não encontrada ou acesso negado.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_ordens_entregas
    where id = p_entrega_id
      and empresa_id = v_empresa_id;
    return;
  end if;

  if p_entrega_id is not null then
    update public.industria_ordens_entregas
    set
      data_entrega        = coalesce(p_data_entrega, data_entrega),
      quantidade_entregue = coalesce(p_quantidade_entregue, quantidade_entregue),
      status_faturamento  = coalesce(p_status_faturamento, status_faturamento),
      documento_ref       = p_documento_ref,
      observacoes         = p_observacoes
    where id = p_entrega_id
      and empresa_id = v_empresa_id;
  else
    insert into public.industria_ordens_entregas (
      empresa_id,
      ordem_id,
      data_entrega,
      quantidade_entregue,
      status_faturamento,
      documento_ref,
      observacoes
    ) values (
      v_empresa_id,
      p_ordem_id,
      coalesce(p_data_entrega, current_date),
      p_quantidade_entregue,
      coalesce(p_status_faturamento, 'nao_faturado'),
      p_documento_ref,
      p_observacoes
    );
  end if;
end;
$$;

revoke all on function public.industria_manage_entrega from public;
grant execute on function public.industria_manage_entrega to authenticated, service_role;

create or replace function public.industria_update_ordem_status(
  p_id uuid,
  p_status text,
  p_prioridade int default 0
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  update public.industria_ordens
  set
    status = p_status,
    prioridade = p_prioridade,
    updated_at = now()
  where id = p_id
    and empresa_id = v_empresa_id;
end;
$$;

revoke all on function public.industria_update_ordem_status from public;
grant execute on function public.industria_update_ordem_status to authenticated, service_role;
