-- Backfill "core schema" para PROD quando migrações antigas foram editadas após terem sido aplicadas.
-- Objetivo: alinhar PROD ao schema atual (VERIFY) sem resetar dados.
-- Estratégia: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS + defaults/constraints/policies idempotentes.

begin;

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------
-- Enums
-- -------------------------------------------------------------------
do $$ begin
  create type public.tipo_rastreabilidade as enum ('nenhum', 'lote', 'serial');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.tipo_produto as enum ('produto', 'servico', 'kit', 'materia_prima', 'semiacabado');
exception when duplicate_object then null;
end $$;
-- valores adicionais que aparecem ao longo das migrações
do $$ begin
  alter type public.tipo_produto add value if not exists 'consumivel';
  alter type public.tipo_produto add value if not exists 'fantasma';
exception when undefined_object then null;
end $$;

do $$ begin
  create type public.tipo_pessoa_enum as enum ('fisica', 'juridica', 'estrangeiro');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.contribuinte_icms_enum as enum ('1', '2', '9');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.pessoa_tipo as enum ('cliente', 'fornecedor', 'ambos', 'transportadora', 'colaborador');
exception when duplicate_object then null;
end $$;

-- -------------------------------------------------------------------
-- Funções base
-- -------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------------
-- Tabelas core: empresas / empresa_usuarios / empresa_addons
-- -------------------------------------------------------------------
create table if not exists public.empresas (
  id uuid default gen_random_uuid() primary key,
  nome text,
  cnpj text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  owner_id uuid,
  slug text
);
alter table public.empresas enable row level security;

alter table public.empresas add column if not exists nome text;
alter table public.empresas add column if not exists cnpj text;
alter table public.empresas add column if not exists created_at timestamptz;
alter table public.empresas alter column created_at set default now();
alter table public.empresas add column if not exists updated_at timestamptz;
alter table public.empresas alter column updated_at set default now();
alter table public.empresas add column if not exists owner_id uuid;
alter table public.empresas add column if not exists slug text;

drop policy if exists "Enable read access for all users" on public.empresas;
create policy "Enable read access for all users" on public.empresas for select to public using (true);

create table if not exists public.empresa_addons (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  addon_slug text not null,
  status text default 'active'::text,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.empresa_addons enable row level security;

alter table public.empresa_addons add column if not exists id uuid;
alter table public.empresa_addons alter column id set default gen_random_uuid();
alter table public.empresa_addons add column if not exists empresa_id uuid;
alter table public.empresa_addons add column if not exists addon_slug text;
alter table public.empresa_addons add column if not exists status text;
alter table public.empresa_addons alter column status set default 'active'::text;
alter table public.empresa_addons add column if not exists cancel_at_period_end boolean;
alter table public.empresa_addons alter column cancel_at_period_end set default false;
alter table public.empresa_addons add column if not exists created_at timestamptz;
alter table public.empresa_addons alter column created_at set default now();
alter table public.empresa_addons add column if not exists updated_at timestamptz;
alter table public.empresa_addons alter column updated_at set default now();

do $$
begin
  if to_regclass('public.empresa_addons') is not null
     and not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.empresa_addons'::regclass
         and contype = 'p'
     ) then
    alter table public.empresa_addons add constraint empresa_addons_pkey primary key (id);
  end if;
end $$;

drop policy if exists "Enable all access" on public.empresa_addons;
create policy "Enable all access" on public.empresa_addons for all to public using (empresa_id = current_empresa_id());

create table if not exists public.empresa_usuarios (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null,
  role text default 'member'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, user_id)
);
alter table public.empresa_usuarios enable row level security;

alter table public.empresa_usuarios add column if not exists id uuid;
alter table public.empresa_usuarios alter column id set default gen_random_uuid();
alter table public.empresa_usuarios add column if not exists empresa_id uuid;
alter table public.empresa_usuarios add column if not exists user_id uuid;
alter table public.empresa_usuarios add column if not exists role text;
alter table public.empresa_usuarios alter column role set default 'member'::text;
alter table public.empresa_usuarios add column if not exists created_at timestamptz;
alter table public.empresa_usuarios alter column created_at set default now();
alter table public.empresa_usuarios add column if not exists updated_at timestamptz;
alter table public.empresa_usuarios alter column updated_at set default now();

do $$
begin
  if to_regclass('public.empresa_usuarios') is not null
     and not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.empresa_usuarios'::regclass
         and contype = 'p'
     ) then
    alter table public.empresa_usuarios add constraint empresa_usuarios_pkey primary key (id);
  end if;
end $$;
-- Garante a constraint UNIQUE (empresa_id, user_id) mesmo em bases que só tinham índice.
do $$
begin
  if to_regclass('public.empresa_usuarios') is not null
     and not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.empresa_usuarios'::regclass
         and conname = 'empresa_usuarios_empresa_id_user_id_key'
     ) then
    -- Usa o índice se já existir (requer ser UNIQUE e compatível)
    if to_regclass('public.empresa_usuarios_empresa_id_user_id_key') is not null then
      alter table public.empresa_usuarios
        add constraint empresa_usuarios_empresa_id_user_id_key
        unique using index empresa_usuarios_empresa_id_user_id_key;
    else
      alter table public.empresa_usuarios
        add constraint empresa_usuarios_empresa_id_user_id_key
        unique (empresa_id, user_id);
    end if;
  end if;
end $$;

drop policy if exists "Users can see their own memberships" on public.empresa_usuarios;
create policy "Users can see their own memberships"
  on public.empresa_usuarios
  for select
  to public
  using ((user_id = current_user_id()) or (user_id = auth.uid()));

create unique index if not exists empresa_addons_pkey on public.empresa_addons(id);
create unique index if not exists empresa_usuarios_pkey on public.empresa_usuarios(id);
create unique index if not exists empresa_usuarios_empresa_id_user_id_key on public.empresa_usuarios(empresa_id, user_id);

-- -------------------------------------------------------------------
-- Produtos / Produto Imagens
-- -------------------------------------------------------------------
create table if not exists public.produtos (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  nome text,
  descricao text,
  codigo text,
  sku text,
  unidade text default 'un'::text,
  preco_custo numeric(15,4) default 0,
  preco_venda numeric(15,4) default 0,
  tipo text default 'produto'::text,
  ativo boolean default true,
  controlar_estoque boolean default true,
  controlar_lotes boolean default false,
  estoque_minimo numeric(15,4) default 0,
  estoque_atual numeric(15,4) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  rastreabilidade public.tipo_rastreabilidade default 'nenhum'::public.tipo_rastreabilidade,
  grupo_id uuid,
  pode_comprar boolean default false,
  pode_vender boolean default false,
  pode_produzir boolean default false,
  rastreio_lote boolean default false,
  rastreio_serial boolean default false,
  estoque_seguranca numeric default 0,
  lote_minimo_compra numeric default 0,
  lead_time_dias integer default 0
);
alter table public.produtos enable row level security;

alter table public.produtos add column if not exists empresa_id uuid;
alter table public.produtos alter column empresa_id set default current_empresa_id();
alter table public.produtos add column if not exists nome text;
alter table public.produtos add column if not exists descricao text;
alter table public.produtos add column if not exists codigo text;
alter table public.produtos add column if not exists sku text;
alter table public.produtos add column if not exists unidade text;
alter table public.produtos alter column unidade set default 'un'::text;
alter table public.produtos add column if not exists preco_custo numeric(15,4);
alter table public.produtos alter column preco_custo set default 0;
alter table public.produtos add column if not exists preco_venda numeric(15,4);
alter table public.produtos alter column preco_venda set default 0;
alter table public.produtos add column if not exists tipo text;
-- Em alguns bancos antigos, `produtos.tipo` pode ser enum `public.tipo_produto` (não text).
-- Ajusta o default de forma compatível com o tipo atual da coluna.
do $$
declare
  v_typ regtype;
  v_enum regtype := to_regtype('public.tipo_produto');
begin
  select a.atttypid::regtype
    into v_typ
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'produtos'
     and a.attname = 'tipo'
     and a.attnum > 0
     and not a.attisdropped;

  if v_enum is not null and v_typ = v_enum then
    -- Garante que o valor 'produto' existe no enum, evitando erro 22P02
    execute 'alter type public.tipo_produto add value if not exists ''produto''';
    begin
      execute 'alter table public.produtos alter column tipo set default ''produto''::public.tipo_produto';
    exception
      when others then
        raise notice 'Não foi possível ajustar default de produtos.tipo como enum (%). Mantendo default atual.', SQLERRM;
    end;
  else
    begin
      execute 'alter table public.produtos alter column tipo set default ''produto''::text';
    exception
      when others then
        raise notice 'Não foi possível ajustar default de produtos.tipo como text (%). Mantendo default atual.', SQLERRM;
    end;
  end if;
end $$;
alter table public.produtos add column if not exists ativo boolean;
alter table public.produtos alter column ativo set default true;
alter table public.produtos add column if not exists controlar_estoque boolean;
alter table public.produtos alter column controlar_estoque set default true;
alter table public.produtos add column if not exists controlar_lotes boolean;
alter table public.produtos alter column controlar_lotes set default false;
alter table public.produtos add column if not exists estoque_minimo numeric(15,4);
alter table public.produtos alter column estoque_minimo set default 0;
alter table public.produtos add column if not exists estoque_atual numeric(15,4);
alter table public.produtos alter column estoque_atual set default 0;
alter table public.produtos add column if not exists created_at timestamptz;
alter table public.produtos alter column created_at set default now();
alter table public.produtos add column if not exists updated_at timestamptz;
alter table public.produtos alter column updated_at set default now();
alter table public.produtos add column if not exists rastreabilidade public.tipo_rastreabilidade;
alter table public.produtos alter column rastreabilidade set default 'nenhum'::public.tipo_rastreabilidade;
alter table public.produtos add column if not exists grupo_id uuid;
alter table public.produtos add column if not exists pode_comprar boolean;
alter table public.produtos alter column pode_comprar set default false;
alter table public.produtos add column if not exists pode_vender boolean;
alter table public.produtos alter column pode_vender set default false;
alter table public.produtos add column if not exists pode_produzir boolean;
alter table public.produtos alter column pode_produzir set default false;
alter table public.produtos add column if not exists rastreio_lote boolean;
alter table public.produtos alter column rastreio_lote set default false;
alter table public.produtos add column if not exists rastreio_serial boolean;
alter table public.produtos alter column rastreio_serial set default false;
alter table public.produtos add column if not exists estoque_seguranca numeric;
alter table public.produtos alter column estoque_seguranca set default 0;
alter table public.produtos add column if not exists lote_minimo_compra numeric;
alter table public.produtos alter column lote_minimo_compra set default 0;
alter table public.produtos add column if not exists lead_time_dias integer;
alter table public.produtos alter column lead_time_dias set default 0;

-- Policies: produtos (algumas instalações antigas não tinham)
do $$ begin
  execute 'drop policy if exists "Enable read access for all users" on public.produtos';
  execute 'create policy "Enable read access for all users" on public.produtos for select to public using (empresa_id = current_empresa_id())';
  execute 'drop policy if exists "Enable insert for authenticated users only" on public.produtos';
  execute 'create policy "Enable insert for authenticated users only" on public.produtos for insert to public with check (empresa_id = current_empresa_id())';
  execute 'drop policy if exists "Enable update for authenticated users only" on public.produtos';
  execute 'create policy "Enable update for authenticated users only" on public.produtos for update to public using (empresa_id = current_empresa_id())';
  execute 'drop policy if exists "Enable delete for authenticated users only" on public.produtos';
  execute 'create policy "Enable delete for authenticated users only" on public.produtos for delete to public using (empresa_id = current_empresa_id())';
exception when undefined_table then null;
end $$;

create table if not exists public.produto_imagens (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  url text not null,
  "position" integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.produto_imagens enable row level security;

alter table public.produto_imagens add column if not exists empresa_id uuid;
alter table public.produto_imagens alter column empresa_id set default current_empresa_id();
alter table public.produto_imagens add column if not exists "position" integer;
alter table public.produto_imagens alter column "position" set default 0;
alter table public.produto_imagens add column if not exists created_at timestamptz;
alter table public.produto_imagens alter column created_at set default now();
alter table public.produto_imagens add column if not exists updated_at timestamptz;
alter table public.produto_imagens alter column updated_at set default now();

drop policy if exists "Enable all access" on public.produto_imagens;
create policy "Enable all access" on public.produto_imagens for all to public using (empresa_id = current_empresa_id());

-- -------------------------------------------------------------------
-- Estoque movimentos (colunas usadas por módulos novos)
-- -------------------------------------------------------------------
create table if not exists public.estoque_movimentos (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  tipo text,
  quantidade numeric(15,4),
  saldo_anterior numeric(15,4),
  saldo_atual numeric(15,4),
  custo_medio numeric(15,4) default 0,
  origem text,
  origem_id uuid,
  observacoes text,
  created_at timestamptz default now(),
  lote text,
  seriais jsonb,
  data_movimento date default current_date,
  origem_tipo text,
  tipo_mov text
);
alter table public.estoque_movimentos enable row level security;

alter table public.estoque_movimentos add column if not exists saldo_atual numeric(15,4);
alter table public.estoque_movimentos add column if not exists custo_medio numeric(15,4);
alter table public.estoque_movimentos alter column custo_medio set default 0;
alter table public.estoque_movimentos add column if not exists origem text;
alter table public.estoque_movimentos add column if not exists origem_id uuid;
alter table public.estoque_movimentos add column if not exists observacoes text;
alter table public.estoque_movimentos add column if not exists created_at timestamptz;
alter table public.estoque_movimentos alter column created_at set default now();
alter table public.estoque_movimentos add column if not exists lote text;
alter table public.estoque_movimentos add column if not exists seriais jsonb;
alter table public.estoque_movimentos add column if not exists data_movimento date;
alter table public.estoque_movimentos alter column data_movimento set default current_date;
alter table public.estoque_movimentos add column if not exists origem_tipo text;
alter table public.estoque_movimentos add column if not exists tipo_mov text;

do $$ begin
  alter table public.estoque_movimentos add constraint estoque_movimentos_produto_id_fkey
    foreign key (produto_id) references public.produtos(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$ begin
  execute 'drop policy if exists "Enable read access for all users" on public.estoque_movimentos';
  execute 'create policy "Enable read access for all users" on public.estoque_movimentos for select to public using (empresa_id = current_empresa_id())';
  execute 'drop policy if exists "Enable insert for authenticated users only" on public.estoque_movimentos';
  execute 'create policy "Enable insert for authenticated users only" on public.estoque_movimentos for insert to public with check (empresa_id = current_empresa_id())';
exception when undefined_table then null;
end $$;

-- -------------------------------------------------------------------
-- Indústria (subset necessário para execução/PCP/QA)
-- -------------------------------------------------------------------
create table if not exists public.industria_centros_trabalho (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  nome text,
  codigo text,
  descricao text,
  custo_hora numeric(15,4) default 0,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  tempo_setup_min integer default 0,
  requer_inspecao_final boolean default false,
  capacidade_horas_dia numeric(15,4) default 8
);
alter table public.industria_centros_trabalho enable row level security;
drop policy if exists "Enable all access" on public.industria_centros_trabalho;
create policy "Enable all access" on public.industria_centros_trabalho for all to public using (empresa_id = current_empresa_id());

alter table public.industria_centros_trabalho add column if not exists custo_hora numeric(15,4);
alter table public.industria_centros_trabalho alter column custo_hora set default 0;
alter table public.industria_centros_trabalho add column if not exists ativo boolean;
alter table public.industria_centros_trabalho alter column ativo set default true;
alter table public.industria_centros_trabalho add column if not exists created_at timestamptz;
alter table public.industria_centros_trabalho alter column created_at set default now();
alter table public.industria_centros_trabalho add column if not exists updated_at timestamptz;
alter table public.industria_centros_trabalho alter column updated_at set default now();
alter table public.industria_centros_trabalho add column if not exists tempo_setup_min integer;
alter table public.industria_centros_trabalho alter column tempo_setup_min set default 0;
alter table public.industria_centros_trabalho add column if not exists requer_inspecao_final boolean;
alter table public.industria_centros_trabalho alter column requer_inspecao_final set default false;
alter table public.industria_centros_trabalho add column if not exists capacidade_horas_dia numeric(15,4);
alter table public.industria_centros_trabalho alter column capacidade_horas_dia set default 8;

create table if not exists public.industria_producao_ordens (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  numero bigint,
  produto_final_id uuid references public.produtos(id),
  quantidade_planejada numeric(15,4) default 0,
  unidade text default 'un'::text,
  documento_ref text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  roteiro_aplicado_id uuid,
  roteiro_aplicado_desc text,
  bom_aplicado_id uuid,
  bom_aplicado_desc text,
  lote_producao text,
  reserva_modo text default 'ao_liberar'::text,
  tolerancia_overrun_percent numeric default 0,
  total_entregue numeric default 0,
  percentual_concluido numeric default 0
);
alter table public.industria_producao_ordens enable row level security;
drop policy if exists "Enable all access" on public.industria_producao_ordens;
create policy "Enable all access" on public.industria_producao_ordens for all to public using (empresa_id = current_empresa_id());

alter table public.industria_producao_ordens add column if not exists quantidade_planejada numeric(15,4);
alter table public.industria_producao_ordens alter column quantidade_planejada set default 0;
alter table public.industria_producao_ordens add column if not exists unidade text;
alter table public.industria_producao_ordens alter column unidade set default 'un'::text;
alter table public.industria_producao_ordens add column if not exists documento_ref text;
alter table public.industria_producao_ordens add column if not exists observacoes text;
alter table public.industria_producao_ordens add column if not exists created_at timestamptz;
alter table public.industria_producao_ordens alter column created_at set default now();
alter table public.industria_producao_ordens add column if not exists updated_at timestamptz;
alter table public.industria_producao_ordens alter column updated_at set default now();
alter table public.industria_producao_ordens add column if not exists roteiro_aplicado_id uuid;
alter table public.industria_producao_ordens add column if not exists roteiro_aplicado_desc text;
alter table public.industria_producao_ordens add column if not exists bom_aplicado_id uuid;
alter table public.industria_producao_ordens add column if not exists bom_aplicado_desc text;
alter table public.industria_producao_ordens add column if not exists lote_producao text;
alter table public.industria_producao_ordens add column if not exists reserva_modo text;
alter table public.industria_producao_ordens alter column reserva_modo set default 'ao_liberar'::text;
alter table public.industria_producao_ordens add column if not exists tolerancia_overrun_percent numeric;
alter table public.industria_producao_ordens alter column tolerancia_overrun_percent set default 0;
alter table public.industria_producao_ordens add column if not exists total_entregue numeric;
alter table public.industria_producao_ordens alter column total_entregue set default 0;
alter table public.industria_producao_ordens add column if not exists percentual_concluido numeric;
alter table public.industria_producao_ordens alter column percentual_concluido set default 0;

do $$
begin
  if to_regclass('public.industria_producao_ordens') is not null
     and not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.industria_producao_ordens'::regclass
         and contype = 'p'
     ) then
    alter table public.industria_producao_ordens add constraint industria_producao_ordens_pkey primary key (id);
  end if;
end $$;
do $$ begin
  alter table public.industria_producao_ordens add constraint industria_producao_ordens_produto_final_id_fkey
    foreign key (produto_final_id) references public.produtos(id);
exception when duplicate_object then null;
end $$;

create unique index if not exists industria_producao_ordens_pkey on public.industria_producao_ordens(id);

create table if not exists public.industria_producao_componentes (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  ordem_id uuid not null references public.industria_producao_ordens(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  quantidade_planejada numeric(15,4) default 0,
  unidade text default 'un'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  quantidade_reservada numeric(15,4) default 0
);
alter table public.industria_producao_componentes enable row level security;
drop policy if exists "Enable all access" on public.industria_producao_componentes;
create policy "Enable all access" on public.industria_producao_componentes for all to public using (empresa_id = current_empresa_id());

alter table public.industria_producao_componentes add column if not exists unidade text;
alter table public.industria_producao_componentes alter column unidade set default 'un'::text;
alter table public.industria_producao_componentes add column if not exists created_at timestamptz;
alter table public.industria_producao_componentes alter column created_at set default now();
alter table public.industria_producao_componentes add column if not exists updated_at timestamptz;
alter table public.industria_producao_componentes alter column updated_at set default now();
alter table public.industria_producao_componentes add column if not exists quantidade_reservada numeric(15,4);
alter table public.industria_producao_componentes alter column quantidade_reservada set default 0;

do $$
begin
  if to_regclass('public.industria_producao_componentes') is not null
     and not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.industria_producao_componentes'::regclass
         and contype = 'p'
     ) then
    alter table public.industria_producao_componentes add constraint industria_producao_componentes_pkey primary key (id);
  end if;
end $$;
do $$ begin
  alter table public.industria_producao_componentes add constraint industria_producao_componentes_ordem_id_fkey
    foreign key (ordem_id) references public.industria_producao_ordens(id) on delete cascade;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.industria_producao_componentes add constraint industria_producao_componentes_produto_id_fkey
    foreign key (produto_id) references public.produtos(id);
exception when duplicate_object then null;
end $$;

create unique index if not exists industria_producao_componentes_pkey on public.industria_producao_componentes(id);

create table if not exists public.industria_producao_entregas (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  ordem_id uuid not null references public.industria_producao_ordens(id) on delete cascade,
  data_entrega date,
  quantidade_entregue numeric(15,4) default 0,
  documento_ref text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.industria_producao_entregas enable row level security;
drop policy if exists "Enable all access" on public.industria_producao_entregas;
create policy "Enable all access" on public.industria_producao_entregas for all to public using (empresa_id = current_empresa_id());

alter table public.industria_producao_entregas add column if not exists quantidade_entregue numeric(15,4);
alter table public.industria_producao_entregas alter column quantidade_entregue set default 0;
alter table public.industria_producao_entregas add column if not exists documento_ref text;
alter table public.industria_producao_entregas add column if not exists observacoes text;
alter table public.industria_producao_entregas add column if not exists created_at timestamptz;
alter table public.industria_producao_entregas alter column created_at set default now();
alter table public.industria_producao_entregas add column if not exists updated_at timestamptz;
alter table public.industria_producao_entregas alter column updated_at set default now();

do $$
begin
  if to_regclass('public.industria_producao_entregas') is not null
     and not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.industria_producao_entregas'::regclass
         and contype = 'p'
     ) then
    alter table public.industria_producao_entregas add constraint industria_producao_entregas_pkey primary key (id);
  end if;
end $$;
do $$ begin
  alter table public.industria_producao_entregas add constraint industria_producao_entregas_ordem_id_fkey
    foreign key (ordem_id) references public.industria_producao_ordens(id) on delete cascade;
exception when duplicate_object then null;
end $$;

create unique index if not exists industria_producao_entregas_pkey on public.industria_producao_entregas(id);

create table if not exists public.industria_roteiros (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  produto_id uuid references public.produtos(id) on delete cascade,
  nome text,
  versao text default '1.0'::text,
  padrao boolean default false,
  ativo boolean default true,
  descricao text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.industria_roteiros enable row level security;
drop policy if exists "Enable all access" on public.industria_roteiros;
create policy "Enable all access" on public.industria_roteiros for all to public using (empresa_id = current_empresa_id());

alter table public.industria_roteiros add column if not exists nome text;
alter table public.industria_roteiros add column if not exists versao text;
-- Alguns bancos legados têm `versao` como integer; ajusta default de forma tolerante.
do $$
declare
  v_typ regtype;
begin
  select a.atttypid::regtype
    into v_typ
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'industria_roteiros'
     and a.attname = 'versao'
     and a.attnum > 0
     and not a.attisdropped;

  if v_typ::text in ('text','character varying') then
    begin
      execute 'alter table public.industria_roteiros alter column versao set default ''1.0''::text';
    exception when others then
      raise notice 'Não foi possível ajustar default de industria_roteiros.versao (text): %', SQLERRM;
    end;
  elsif v_typ::text = 'integer' then
    begin
      execute 'alter table public.industria_roteiros alter column versao set default 1';
    exception when others then
      raise notice 'Não foi possível ajustar default de industria_roteiros.versao (integer): %', SQLERRM;
    end;
  else
    raise notice 'Tipo de industria_roteiros.versao inesperado (%); default não alterado.', v_typ::text;
  end if;
end $$;
alter table public.industria_roteiros add column if not exists padrao boolean;
alter table public.industria_roteiros alter column padrao set default false;
alter table public.industria_roteiros add column if not exists ativo boolean;
alter table public.industria_roteiros alter column ativo set default true;
alter table public.industria_roteiros add column if not exists descricao text;
alter table public.industria_roteiros add column if not exists created_at timestamptz;
alter table public.industria_roteiros alter column created_at set default now();
alter table public.industria_roteiros add column if not exists updated_at timestamptz;
alter table public.industria_roteiros alter column updated_at set default now();

do $$ begin
  alter table public.industria_roteiros add constraint industria_roteiros_produto_id_fkey
    foreign key (produto_id) references public.produtos(id) on delete cascade;
exception when duplicate_object then null;
end $$;

create table if not exists public.industria_roteiros_etapas (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  roteiro_id uuid not null references public.industria_roteiros(id) on delete cascade,
  sequencia integer default 1,
  nome text,
  centro_trabalho_id uuid references public.industria_centros_trabalho(id) on delete set null,
  descricao text,
  tempo_setup numeric(15,4) default 0,
  tempo_operacao numeric(15,4) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.industria_roteiros_etapas enable row level security;
drop policy if exists "Enable all access" on public.industria_roteiros_etapas;
create policy "Enable all access" on public.industria_roteiros_etapas for all to public using (empresa_id = current_empresa_id());

alter table public.industria_roteiros_etapas add column if not exists sequencia integer;
alter table public.industria_roteiros_etapas alter column sequencia set default 1;
alter table public.industria_roteiros_etapas add column if not exists nome text;
alter table public.industria_roteiros_etapas add column if not exists centro_trabalho_id uuid;
alter table public.industria_roteiros_etapas add column if not exists descricao text;
alter table public.industria_roteiros_etapas add column if not exists tempo_setup numeric(15,4);
alter table public.industria_roteiros_etapas alter column tempo_setup set default 0;
alter table public.industria_roteiros_etapas add column if not exists tempo_operacao numeric(15,4);
alter table public.industria_roteiros_etapas alter column tempo_operacao set default 0;
alter table public.industria_roteiros_etapas add column if not exists created_at timestamptz;
alter table public.industria_roteiros_etapas alter column created_at set default now();
alter table public.industria_roteiros_etapas add column if not exists updated_at timestamptz;
alter table public.industria_roteiros_etapas alter column updated_at set default now();

do $$ begin
  alter table public.industria_roteiros_etapas add constraint industria_roteiros_etapas_roteiro_id_fkey
    foreign key (roteiro_id) references public.industria_roteiros(id) on delete cascade;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.industria_roteiros_etapas add constraint industria_roteiros_etapas_centro_trabalho_id_fkey
    foreign key (centro_trabalho_id) references public.industria_centros_trabalho(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- View de compatibilidade usado por RPCs legadas
do $$
begin
  if to_regclass('public.industria_roteiros_etapas') is not null then
    execute 'create or replace view public.industria_roteiro_etapas as select * from public.industria_roteiros_etapas';
    execute $c$
      comment on view public.industria_roteiro_etapas
        is 'Compat layer: mirror of industria_roteiros_etapas para funções legadas.';
    $c$;
  end if;
end $$;

-- -------------------------------------------------------------------
-- Pessoas (cadastro unificado)
-- -------------------------------------------------------------------
create table if not exists public.pessoas (
  id uuid default gen_random_uuid() primary key,
  empresa_id uuid default current_empresa_id() not null,
  nome text,
  fantasia text,
  tipo public.pessoa_tipo default 'cliente'::public.pessoa_tipo,
  tipo_pessoa public.tipo_pessoa_enum default 'juridica'::public.tipo_pessoa_enum,
  doc_unico text,
  email text,
  telefone text,
  inscr_estadual text,
  isento_ie boolean default false,
  inscr_municipal text,
  observacoes text,
  codigo_externo text,
  contribuinte_icms public.contribuinte_icms_enum default '9'::public.contribuinte_icms_enum,
  contato_tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

alter table public.pessoas add column if not exists empresa_id uuid;
alter table public.pessoas alter column empresa_id set default current_empresa_id();
alter table public.pessoas add column if not exists nome text;
alter table public.pessoas add column if not exists fantasia text;
alter table public.pessoas add column if not exists tipo public.pessoa_tipo;
alter table public.pessoas alter column tipo set default 'cliente'::public.pessoa_tipo;
alter table public.pessoas add column if not exists tipo_pessoa public.tipo_pessoa_enum;
alter table public.pessoas alter column tipo_pessoa set default 'juridica'::public.tipo_pessoa_enum;
alter table public.pessoas add column if not exists doc_unico text;
alter table public.pessoas add column if not exists email text;
alter table public.pessoas add column if not exists telefone text;
alter table public.pessoas add column if not exists inscr_estadual text;
alter table public.pessoas add column if not exists isento_ie boolean;
alter table public.pessoas alter column isento_ie set default false;
alter table public.pessoas add column if not exists inscr_municipal text;
alter table public.pessoas add column if not exists observacoes text;
alter table public.pessoas add column if not exists codigo_externo text;
alter table public.pessoas add column if not exists contribuinte_icms public.contribuinte_icms_enum;
alter table public.pessoas alter column contribuinte_icms set default '9'::public.contribuinte_icms_enum;
alter table public.pessoas add column if not exists contato_tags text[];
alter table public.pessoas add column if not exists created_at timestamptz;
alter table public.pessoas alter column created_at set default now();
alter table public.pessoas add column if not exists updated_at timestamptz;
alter table public.pessoas alter column updated_at set default now();
alter table public.pessoas add column if not exists deleted_at timestamptz;

-- -------------------------------------------------------------------
-- Funções QA (recriadas para garantir existência)
-- -------------------------------------------------------------------
drop function if exists public.qualidade_planos_list(text);
create or replace function public.qualidade_planos_list(p_search text default null)
returns table (
  id uuid,
  nome text,
  produto_id uuid,
  produto_nome text,
  tipo text,
  severidade text,
  aql text,
  amostragem text,
  ativo boolean,
  roteiro_id uuid,
  roteiro_nome text,
  roteiro_etapa_id uuid,
  etapa_nome text,
  etapa_sequencia integer,
  total_caracteristicas integer,
  updated_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    p.id,
    p.nome,
    p.produto_id,
    prod.nome as produto_nome,
    p.tipo,
    p.severidade,
    p.aql,
    p.amostragem,
    p.ativo,
    p.roteiro_id,
    r.descricao as roteiro_nome,
    p.roteiro_etapa_id,
    coalesce(e.descricao, 'Etapa ' || e.sequencia::text) as etapa_nome,
    e.sequencia as etapa_sequencia,
    coalesce(c.total, 0) as total_caracteristicas,
    p.updated_at
  from public.industria_qualidade_planos p
  join public.produtos prod on prod.id = p.produto_id
  left join public.industria_roteiros r on r.id = p.roteiro_id
  left join public.industria_roteiros_etapas e on e.id = p.roteiro_etapa_id
  left join lateral (
    select count(*) as total
    from public.industria_qualidade_plano_caracteristicas c
    where c.plano_id = p.id
      and c.empresa_id = public.current_empresa_id()
  ) c on true
  where p.empresa_id = public.current_empresa_id()
    and (
      p_search is null
      or p.nome ilike '%' || p_search || '%'
      or prod.nome ilike '%' || p_search || '%'
      or coalesce(e.descricao, '') ilike '%' || p_search || '%'
    )
  order by p.updated_at desc, p.nome asc;
$$;

drop function if exists public.qualidade_plano_get(uuid);
create or replace function public.qualidade_plano_get(p_id uuid)
returns table (
  id uuid,
  nome text,
  produto_id uuid,
  produto_nome text,
  tipo text,
  severidade text,
  aql text,
  amostragem text,
  ativo boolean,
  roteiro_id uuid,
  roteiro_nome text,
  roteiro_etapa_id uuid,
  etapa_nome text,
  etapa_sequencia integer,
  caracteristicas jsonb
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    p.id,
    p.nome,
    p.produto_id,
    prod.nome as produto_nome,
    p.tipo,
    p.severidade,
    p.aql,
    p.amostragem,
    p.ativo,
    p.roteiro_id,
    r.descricao as roteiro_nome,
    p.roteiro_etapa_id,
    coalesce(e.descricao, 'Etapa ' || e.sequencia::text) as etapa_nome,
    e.sequencia as etapa_sequencia,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'descricao', c.descricao,
        'tolerancia_min', c.tolerancia_min,
        'tolerancia_max', c.tolerancia_max,
        'unidade', c.unidade,
        'instrumento', c.instrumento
      ) order by c.created_at desc)
      from public.industria_qualidade_plano_caracteristicas c
      where c.plano_id = p.id
        and c.empresa_id = public.current_empresa_id()
    ), '[]'::jsonb) as caracteristicas
  from public.industria_qualidade_planos p
  join public.produtos prod on prod.id = p.produto_id
  left join public.industria_roteiros r on r.id = p.roteiro_id
  left join public.industria_roteiros_etapas e on e.id = p.roteiro_etapa_id
  where p.id = p_id
    and p.empresa_id = public.current_empresa_id();
$$;

commit;
