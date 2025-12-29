-- =============================================================================
-- MVP: módulos faltantes no menu (Vendas/Serviços/Cadastros/Suporte)
-- Objetivo: transformar itens `href: '#'` em módulos mínimos funcionais (CRUD + auditoria)
-- =============================================================================

BEGIN;

create schema if not exists public;

-- -----------------------------------------------------------------------------
-- 0) RBAC: permissões adicionais (idempotente)
-- -----------------------------------------------------------------------------
insert into public.permissions(module, action) values
  ('vendedores','view'),('vendedores','create'),('vendedores','update'),('vendedores','delete'),
  ('suporte','view')
on conflict (module, action) do nothing;

-- OWNER/ADMIN: sempre tudo liberado
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module in ('vendedores','suporte')
where r.slug in ('OWNER','ADMIN')
on conflict do nothing;

-- MEMBER/OPS/FINANCE/VIEWER: leitura por padrão (pode ser ajustado depois)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on (
    (p.module = 'vendedores' and p.action = 'view')
    or (p.module = 'suporte' and p.action = 'view')
  )
where r.slug in ('MEMBER','OPS','FINANCE','VIEWER')
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- 1) Cadastros: Vendedores
-- -----------------------------------------------------------------------------
create table if not exists public.vendedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  email text,
  telefone text,
  comissao_percent numeric(8,4) not null default 0 check (comissao_percent >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendedores_empresa on public.vendedores(empresa_id);
create index if not exists idx_vendedores_empresa_ativo on public.vendedores(empresa_id, ativo);

alter table public.vendedores enable row level security;
alter table public.vendedores force row level security;

drop policy if exists vendedores_all_company_members on public.vendedores;
create policy vendedores_all_company_members
on public.vendedores
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_vendedores_updated on public.vendedores;
create trigger tg_vendedores_updated
  before update on public.vendedores
  for each row execute function public.tg_set_updated_at();


-- -----------------------------------------------------------------------------
-- 2) Vendas: extensões MVP (PDV / Expedição / Automações / Devoluções / Comissões)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.vendas_pedidos') is not null then
    alter table public.vendas_pedidos
      add column if not exists vendedor_id uuid references public.vendedores(id) on delete set null,
      add column if not exists comissao_percent numeric(8,4) not null default 0,
      add column if not exists canal text not null default 'erp'; -- 'erp' | 'pdv'
    create index if not exists idx_vendas_pedidos_empresa_vendedor on public.vendas_pedidos(empresa_id, vendedor_id);
    create index if not exists idx_vendas_pedidos_empresa_canal on public.vendas_pedidos(empresa_id, canal);
  end if;
end $$;

-- Atualiza RPC de upsert de pedidos para aceitar campos adicionais (PDV / comissões)
do $$
begin
  if to_regprocedure('public.vendas_upsert_pedido(jsonb)') is null then
    return;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='vendas_pedidos' and column_name='canal') then
    return;
  end if;

  execute $fn$
  create or replace function public.vendas_upsert_pedido(p_payload jsonb)
   returns jsonb
   language plpgsql
   security definer
   set search_path to 'pg_catalog', 'public'
  as $$
  declare
    v_empresa   uuid := public.current_empresa_id();
    v_id        uuid;
    v_cliente   uuid;
    v_status    text;
    v_data_emis date;
    v_data_ent  date;
    v_frete     numeric;
    v_desc      numeric;
    v_canal     text := nullif(p_payload->>'canal','');
    v_vendedor  uuid := nullif(p_payload->>'vendedor_id','')::uuid;
    v_com_pct   numeric := nullif(p_payload->>'comissao_percent','')::numeric;
  begin
    v_cliente := (p_payload->>'cliente_id')::uuid;
    if v_cliente is null then
      raise exception 'cliente_id é obrigatório.';
    end if;

    if not exists (
      select 1 from public.pessoas c where c.id = v_cliente
    ) then
      raise exception 'Cliente não encontrado.';
    end if;

    v_status := coalesce(p_payload->>'status', 'orcamento');
    if v_status not in ('orcamento','aprovado','cancelado','concluido') then
      raise exception 'Status de pedido inválido.';
    end if;

    v_data_emis := coalesce(
      (p_payload->>'data_emissao')::date,
      current_date
    );
    v_data_ent  := (p_payload->>'data_entrega')::date;

    v_frete := coalesce((p_payload->>'frete')::numeric, 0);
    v_desc  := coalesce((p_payload->>'desconto')::numeric, 0);

    if v_canal is not null and v_canal not in ('erp','pdv') then
      raise exception 'Canal inválido.';
    end if;

    if p_payload->>'id' is not null then
      update public.vendas_pedidos p
      set
        cliente_id         = v_cliente,
        data_emissao       = v_data_emis,
        data_entrega       = v_data_ent,
        status             = v_status,
        frete              = v_frete,
        desconto           = v_desc,
        condicao_pagamento = p_payload->>'condicao_pagamento',
        observacoes        = p_payload->>'observacoes',
        canal              = coalesce(v_canal, p.canal),
        vendedor_id        = coalesce(v_vendedor, p.vendedor_id),
        comissao_percent   = coalesce(v_com_pct, p.comissao_percent)
      where p.id = (p_payload->>'id')::uuid
        and p.empresa_id = v_empresa
      returning p.id into v_id;
    else
      insert into public.vendas_pedidos (
        empresa_id,
        cliente_id,
        data_emissao,
        data_entrega,
        status,
        frete,
        desconto,
        condicao_pagamento,
        observacoes,
        canal,
        vendedor_id,
        comissao_percent
      ) values (
        v_empresa,
        v_cliente,
        v_data_emis,
        v_data_ent,
        v_status,
        v_frete,
        v_desc,
        p_payload->>'condicao_pagamento',
        p_payload->>'observacoes',
        coalesce(v_canal, 'erp'),
        v_vendedor,
        coalesce(v_com_pct, 0)
      )
      returning id into v_id;
    end if;

    perform public.vendas_recalcular_totais(v_id);
    perform pg_notify('app_log', '[RPC] vendas_upsert_pedido: ' || v_id);
    return public.vendas_get_pedido_details(v_id);
  end;
  $$;
  $fn$;
end $$;

create table if not exists public.vendas_expedicoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  pedido_id uuid not null references public.vendas_pedidos(id) on delete cascade,
  status text not null default 'separando' check (status in ('separando','embalado','enviado','entregue','cancelado')),
  transportadora_id uuid references public.transportadoras(id) on delete set null,
  tracking_code text,
  data_envio date,
  data_entrega date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, pedido_id)
);

create index if not exists idx_vendas_expedicoes_empresa on public.vendas_expedicoes(empresa_id);
create index if not exists idx_vendas_expedicoes_empresa_status on public.vendas_expedicoes(empresa_id, status);

alter table public.vendas_expedicoes enable row level security;
alter table public.vendas_expedicoes force row level security;

drop policy if exists vendas_expedicoes_all_company_members on public.vendas_expedicoes;
create policy vendas_expedicoes_all_company_members
on public.vendas_expedicoes
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_vendas_expedicoes_updated on public.vendas_expedicoes;
create trigger tg_vendas_expedicoes_updated
  before update on public.vendas_expedicoes
  for each row execute function public.tg_set_updated_at();


create table if not exists public.vendas_automacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  gatilho text not null default 'manual',
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendas_automacoes_empresa on public.vendas_automacoes(empresa_id);

alter table public.vendas_automacoes enable row level security;
alter table public.vendas_automacoes force row level security;

drop policy if exists vendas_automacoes_all_company_members on public.vendas_automacoes;
create policy vendas_automacoes_all_company_members
on public.vendas_automacoes
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_vendas_automacoes_updated on public.vendas_automacoes;
create trigger tg_vendas_automacoes_updated
  before update on public.vendas_automacoes
  for each row execute function public.tg_set_updated_at();


create table if not exists public.vendas_devolucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  pedido_id uuid not null references public.vendas_pedidos(id) on delete cascade,
  data_devolucao date not null default current_date,
  motivo text,
  valor_total numeric(15,2) not null default 0,
  status text not null default 'registrada' check (status in ('registrada','processada','cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendas_devolucao_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  devolucao_id uuid not null references public.vendas_devolucoes(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade numeric(15,4) not null check (quantidade > 0),
  valor_unitario numeric(15,4) not null default 0 check (valor_unitario >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_vendas_devolucoes_empresa on public.vendas_devolucoes(empresa_id);
create index if not exists idx_vendas_devolucao_itens_empresa on public.vendas_devolucao_itens(empresa_id);

alter table public.vendas_devolucoes enable row level security;
alter table public.vendas_devolucoes force row level security;
alter table public.vendas_devolucao_itens enable row level security;
alter table public.vendas_devolucao_itens force row level security;

drop policy if exists vendas_devolucoes_all_company_members on public.vendas_devolucoes;
create policy vendas_devolucoes_all_company_members
on public.vendas_devolucoes
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop policy if exists vendas_devolucao_itens_all_company_members on public.vendas_devolucao_itens;
create policy vendas_devolucao_itens_all_company_members
on public.vendas_devolucao_itens
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_vendas_devolucoes_updated on public.vendas_devolucoes;
create trigger tg_vendas_devolucoes_updated
  before update on public.vendas_devolucoes
  for each row execute function public.tg_set_updated_at();


-- -----------------------------------------------------------------------------
-- 3) Serviços: Contratos / Notas de Serviço / Cobranças (MVP)
-- -----------------------------------------------------------------------------
create table if not exists public.servicos_contratos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cliente_id uuid references public.pessoas(id) on delete set null,
  numero text,
  descricao text not null,
  valor_mensal numeric(15,2) not null default 0 check (valor_mensal >= 0),
  status text not null default 'ativo' check (status in ('ativo','suspenso','cancelado')),
  data_inicio date default current_date,
  data_fim date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_servicos_contratos_empresa on public.servicos_contratos(empresa_id);

alter table public.servicos_contratos enable row level security;
alter table public.servicos_contratos force row level security;

drop policy if exists servicos_contratos_all_company_members on public.servicos_contratos;
create policy servicos_contratos_all_company_members
on public.servicos_contratos
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_servicos_contratos_updated on public.servicos_contratos;
create trigger tg_servicos_contratos_updated
  before update on public.servicos_contratos
  for each row execute function public.tg_set_updated_at();


create table if not exists public.servicos_notas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  contrato_id uuid references public.servicos_contratos(id) on delete set null,
  competencia date,
  descricao text not null,
  valor numeric(15,2) not null default 0 check (valor >= 0),
  status text not null default 'rascunho' check (status in ('rascunho','emitida','cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_servicos_notas_empresa on public.servicos_notas(empresa_id);

alter table public.servicos_notas enable row level security;
alter table public.servicos_notas force row level security;

drop policy if exists servicos_notas_all_company_members on public.servicos_notas;
create policy servicos_notas_all_company_members
on public.servicos_notas
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_servicos_notas_updated on public.servicos_notas;
create trigger tg_servicos_notas_updated
  before update on public.servicos_notas
  for each row execute function public.tg_set_updated_at();


create table if not exists public.servicos_cobrancas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nota_id uuid references public.servicos_notas(id) on delete set null,
  cliente_id uuid references public.pessoas(id) on delete set null,
  data_vencimento date not null default current_date,
  valor numeric(15,2) not null default 0 check (valor >= 0),
  status text not null default 'pendente' check (status in ('pendente','paga','cancelada')),
  conta_a_receber_id uuid references public.contas_a_receber(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_servicos_cobrancas_empresa on public.servicos_cobrancas(empresa_id);

alter table public.servicos_cobrancas enable row level security;
alter table public.servicos_cobrancas force row level security;

drop policy if exists servicos_cobrancas_all_company_members on public.servicos_cobrancas;
create policy servicos_cobrancas_all_company_members
on public.servicos_cobrancas
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_servicos_cobrancas_updated on public.servicos_cobrancas;
create trigger tg_servicos_cobrancas_updated
  before update on public.servicos_cobrancas
  for each row execute function public.tg_set_updated_at();

-- Grants (evita 403 mesmo com RLS)
grant all on table
  public.vendedores,
  public.vendas_expedicoes,
  public.vendas_automacoes,
  public.vendas_devolucoes,
  public.vendas_devolucao_itens,
  public.servicos_contratos,
  public.servicos_notas,
  public.servicos_cobrancas
to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 4) Auditoria: habilitar audit_logs_trigger nas novas tabelas (se existir)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.audit_logs') is null or to_regprocedure('public.process_audit_log()') is null then
    return;
  end if;

  execute 'drop trigger if exists audit_logs_trigger on public.vendedores';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.vendedores for each row execute function public.process_audit_log()';

  execute 'drop trigger if exists audit_logs_trigger on public.vendas_expedicoes';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.vendas_expedicoes for each row execute function public.process_audit_log()';

  execute 'drop trigger if exists audit_logs_trigger on public.vendas_automacoes';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.vendas_automacoes for each row execute function public.process_audit_log()';

  execute 'drop trigger if exists audit_logs_trigger on public.vendas_devolucoes';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.vendas_devolucoes for each row execute function public.process_audit_log()';

  execute 'drop trigger if exists audit_logs_trigger on public.vendas_devolucao_itens';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.vendas_devolucao_itens for each row execute function public.process_audit_log()';

  execute 'drop trigger if exists audit_logs_trigger on public.servicos_contratos';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.servicos_contratos for each row execute function public.process_audit_log()';

  execute 'drop trigger if exists audit_logs_trigger on public.servicos_notas';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.servicos_notas for each row execute function public.process_audit_log()';

  execute 'drop trigger if exists audit_logs_trigger on public.servicos_cobrancas';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.servicos_cobrancas for each row execute function public.process_audit_log()';
end $$;

-- Força reload do schema cache do PostgREST (evita 404 em /rpc após migração)
select pg_notify('pgrst', 'reload schema');

COMMIT;
