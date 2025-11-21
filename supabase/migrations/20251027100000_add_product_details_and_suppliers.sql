-- 1. Extensões
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- 2. Função helper: usuário atual (sub)
create or replace function public.current_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
      nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
    )
$$;

-- 3. Função helper: empresa atual (claim empresa_id)
create or replace function public.current_empresa_id()
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.empresa_id', true), '')::uuid,
      nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'empresa_id'), '')::uuid
    )
$$;

-- 4. Trigger genérico updated_at
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- tipo do produto
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_produto') then
    create type public.tipo_produto as enum ('simples','kit','variacoes','fabricado','materia_prima');
  end if;
end$$;

-- status
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_produto') then
    create type public.status_produto as enum ('ativo','inativo');
  end if;
end$$;

-- tipo de embalagem
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_embalagem') then
    create type public.tipo_embalagem as enum ('pacote_caixa','envelope','rolo_cilindro','outro');
  end if;
end$$;

-- LINHAS DE PRODUTO (catálogo simples)
create table if not exists public.linhas_produto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint linhas_produto_unq unique (empresa_id, nome)
);

-- FORNECEDORES (cadastro básico)
create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fornecedores_unq unique (empresa_id, nome)
);

-- Vínculo Produto ↔ Fornecedor (com "código no fornecedor")
create table if not exists public.produto_fornecedores (
  produto_id uuid not null references public.produtos(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete restrict,
  empresa_id uuid not null,
  codigo_no_fornecedor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (produto_id, fornecedor_id)
);

-- Campos comerciais
alter table public.produtos
  add column if not exists itens_por_caixa int default 0 check (itens_por_caixa >= 0),
  add column if not exists preco_custo numeric(14,2) check (preco_custo is null or preco_custo >= 0),
  add column if not exists linha_produto_id uuid,
  add column if not exists garantia_meses int check (garantia_meses is null or garantia_meses between 0 and 120),
  add column if not exists markup numeric(10,5) default 0 check (markup >= 0),
  add column if not exists permitir_inclusao_vendas boolean not null default true;

-- Informações tributárias adicionais
alter table public.produtos
  add column if not exists gtin_tributavel text,                 -- GTIN/EAN da caixa/fardo/lote
  add column if not exists unidade_tributavel text,              -- sigla usada em NF de exportação
  add column if not exists fator_conversao numeric(14,6) check (fator_conversao is null or fator_conversao > 0),
  add column if not exists codigo_enquadramento_ipi text,        -- Cód. Enquadramento IPI
  add column if not exists valor_ipi_fixo numeric(14,2) check (valor_ipi_fixo is null or valor_ipi_fixo >= 0),
  add column if not exists codigo_enquadramento_legal_ipi text,  -- Enquadramento Legal do IPI
  add column if not exists ex_tipi text,                         -- EX TIPI
  -- Observações internas (uso não exibido ao cliente)
  add column if not exists observacoes_internas text;

-- FK opcionais
alter table public.produtos
  add constraint if not exists fk_produtos_linha_produto
  foreign key (linha_produto_id) references public.linhas_produto(id) on delete set null;

-- Índices úteis
create index if not exists idx_produtos_empresa_linha on public.produtos(empresa_id, linha_produto_id);
create index if not exists idx_produtos_gtin_tributavel on public.produtos(gtin_tributavel);

-- Habilitar RLS
alter table public.linhas_produto enable row level security;
alter table public.fornecedores  enable row level security;
alter table public.produto_fornecedores enable row level security;

-- Políticas (SELECT/INSERT/UPDATE/DELETE) usando public.is_tenant_row(empresa_id)
do $$
begin
  if not exists (select 1 from pg_policies where policyname='linhas_produto_sel') then
    create policy linhas_produto_sel on public.linhas_produto for select using (public.is_tenant_row(empresa_id));
    create policy linhas_produto_ins on public.linhas_produto for insert with check (public.is_tenant_row(empresa_id));
    create policy linhas_produto_upd on public.linhas_produto for update using (public.is_tenant_row(empresa_id)) with check (public.is_tenant_row(empresa_id));
    create policy linhas_produto_del on public.linhas_produto for delete using (public.is_tenant_row(empresa_id));
  end if;

  if not exists (select 1 from pg_policies where policyname='fornecedores_sel') then
    create policy fornecedores_sel on public.fornecedores for select using (public.is_tenant_row(empresa_id));
    create policy fornecedores_ins on public.fornecedores for insert with check (public.is_tenant_row(empresa_id));
    create policy fornecedores_upd on public.fornecedores for update using (public.is_tenant_row(empresa_id)) with check (public.is_tenant_row(empresa_id));
    create policy fornecedores_del on public.fornecedores for delete using (public.is_tenant_row(empresa_id));
  end if;

  if not exists (select 1 from pg_policies where policyname='produto_fornecedores_sel') then
    create policy produto_fornecedores_sel on public.produto_fornecedores for select using (public.is_tenant_row(empresa_id));
    create policy produto_fornecedores_ins on public.produto_fornecedores for insert with check (public.is_tenant_row(empresa_id));
    create policy produto_fornecedores_upd on public.produto_fornecedores for update using (public.is_tenant_row(empresa_id)) with check (public.is_tenant_row(empresa_id));
    create policy produto_fornecedores_del on public.produto_fornecedores for delete using (public.is_tenant_row(empresa_id));
  end if;
end$$;

-- Triggers updated_at nas novas tabelas
drop trigger if exists set_updated_at_linhas_produto on public.linhas_produto;
create trigger set_updated_at_linhas_produto
before update on public.linhas_produto
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at_fornecedores on public.fornecedores;
create trigger set_updated_at_fornecedores
before update on public.fornecedores
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at_produto_fornecedores on public.produto_fornecedores;
create trigger set_updated_at_produto_fornecedores
before update on public.produto_fornecedores
for each row execute function public.tg_set_updated_at();

-- Reforço: garantir que vínculos respeitem a mesma empresa do produto/fornecedor
create or replace function public.enforce_same_empresa_produto_ou_fornecedor()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare v_emp_prod uuid; v_emp_forn uuid;
begin
  if TG_TABLE_NAME = 'produto_fornecedores' then
    select empresa_id into v_emp_prod from public.produtos where id = new.produto_id;
    select empresa_id into v_emp_forn from public.fornecedores where id = new.fornecedor_id;
    if v_emp_prod is null or v_emp_forn is null or new.empresa_id is distinct from v_emp_prod or new.empresa_id is distinct from v_emp_forn then
      raise exception '[RLS][GUARD] empresa_id difere do produto/fornecedor';
    end if;
    return new;
  end if;
  return new;
end; $$;

drop trigger if exists tg_emp_match_produto_fornecedores on public.produto_fornecedores;
create trigger tg_emp_match_produto_fornecedores
before insert or update on public.produto_fornecedores
for each row execute function public.enforce_same_empresa_produto_ou_fornecedor();

-- create_product_for_current_user: permitir receber/armazenar novos campos
create or replace function public.create_product_for_current_user(payload jsonb)
returns public.produtos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_prod public.produtos;
begin
  if v_empresa_id is null then
    raise exception '[AUTH] empresa_id ausente no JWT' using errcode = '28000';
  end if;

  perform public.validate_fiscais(payload->>'ncm', payload->>'cest');

  insert into public.produtos (
    empresa_id, tipo, status, nome, descricao, sku, gtin, unidade, preco_venda, moeda,
    icms_origem, ncm, cest,
    tipo_embalagem, embalagem, peso_liquido_kg, peso_bruto_kg, num_volumes,
    largura_cm, altura_cm, comprimento_cm, diametro_cm,
    controla_estoque, estoque_min, estoque_max, controlar_lotes, localizacao, dias_preparacao,
    marca_id, tabela_medidas_id, produto_pai_id,
    descricao_complementar, video_url, slug, seo_titulo, seo_descricao, keywords,
    itens_por_caixa, preco_custo, linha_produto_id, garantia_meses, markup, permitir_inclusao_vendas,
    gtin_tributavel, unidade_tributavel, fator_conversao,
    codigo_enquadramento_ipi, valor_ipi_fixo, codigo_enquadramento_legal_ipi, ex_tipi,
    observacoes_internas
  )
  values (
    v_empresa_id,
    coalesce((payload->>'tipo')::public.tipo_produto, 'simples'),
    coalesce((payload->>'status')::public.status_produto, 'ativo'),
    payload->>'nome',
    payload->>'descricao',
    nullif(payload->>'sku',''),
    nullif(payload->>'gtin',''),
    coalesce(payload->>'unidade','un'),
    coalesce((payload->>'preco_venda')::numeric,0),
    coalesce(payload->>'moeda','BRL'),
    coalesce((payload->>'icms_origem')::int2,0),
    nullif(payload->>'ncm',''),
    nullif(payload->>'cest',''),
    coalesce((payload->>'tipo_embalagem')::public.tipo_embalagem,'pacote_caixa'),
    nullif(payload->>'embalagem',''),
    coalesce((payload->>'peso_liquido_kg')::numeric,0),
    coalesce((payload->>'peso_bruto_kg')::numeric,0),
    coalesce((payload->>'num_volumes')::int,0),
    coalesce((payload->>'largura_cm')::numeric,0),
    coalesce((payload->>'altura_cm')::numeric,0),
    coalesce((payload->>'comprimento_cm')::numeric,0),
    coalesce((payload->>'diametro_cm')::numeric,0),
    coalesce((payload->>'controla_estoque')::boolean,true),
    coalesce((payload->>'estoque_min')::numeric,0),
    coalesce((payload->>'estoque_max')::numeric,0),
    coalesce((payload->>'controlar_lotes')::boolean,false),
    nullif(payload->>'localizacao',''),
    coalesce((payload->>'dias_preparacao')::int,0),
    (payload->>'marca_id')::uuid,
    (payload->>'tabela_medidas_id')::uuid,
    (payload->>'produto_pai_id')::uuid,
    payload->>'descricao_complementar',
    nullif(payload->>'video_url',''),
    nullif(payload->>'slug',''),
    nullif(payload->>'seo_titulo',''),
    nullif(payload->>'seo_descricao',''),
    nullif(payload->>'keywords',''),
    coalesce((payload->>'itens_por_caixa')::int,0),
    (payload->>'preco_custo')::numeric,
    (payload->>'linha_produto_id')::uuid,
    (payload->>'garantia_meses')::int,
    coalesce((payload->>'markup')::numeric,0),
    coalesce((payload->>'permitir_inclusao_vendas')::boolean,true),
    nullif(payload->>'gtin_tributavel',''),
    nullif(payload->>'unidade_tributavel',''),
    (payload->>'fator_conversao')::numeric,
    nullif(payload->>'codigo_enquadramento_ipi',''),
    (payload->>'valor_ipi_fixo')::numeric,
    nullif(payload->>'codigo_enquadramento_legal_ipi',''),
    nullif(payload->>'ex_tipi',''),
    payload->>'observacoes_internas'
  )
  returning * into v_prod;

  return v_prod;
end;
$$;
