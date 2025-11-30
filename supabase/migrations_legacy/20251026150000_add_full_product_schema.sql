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

-- MARCAS (opcional)
create table if not exists public.marcas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marcas_nome_unique_per_company unique (empresa_id, nome)
);

-- TABELAS DE MEDIDAS (opcional)
create table if not exists public.tabelas_medidas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tabelas_medidas_nome_unique_per_company unique (empresa_id, nome)
);

-- PRODUTOS
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  tipo public.tipo_produto not null default 'simples',
  status public.status_produto not null default 'ativo',
  nome text not null check (char_length(nome) between 1 and 255),
  descricao text,
  sku text,
  gtin text, -- EAN/GTIN opcional (8..14)
  unidade text not null check (char_length(unidade) between 1 and 8),
  preco_venda numeric(14,2) not null check (preco_venda >= 0),
  moeda char(3) not null default 'BRL',

  -- Fiscais
  icms_origem int2 not null check (icms_origem between 0 and 8),
  ncm text,  -- 10011010 ou 1001.10.10
  cest text,

  -- Dimensões/Peso
  tipo_embalagem public.tipo_embalagem not null default 'pacote_caixa',
  embalagem text,
  peso_liquido_kg numeric(10,3) default 0 check (peso_liquido_kg >= 0),
  peso_bruto_kg  numeric(10,3) default 0 check (peso_bruto_kg  >= 0),
  num_volumes int default 0 check (num_volumes >= 0),
  largura_cm numeric(10,1) default 0 check (largura_cm >= 0),
  altura_cm numeric(10,1) default 0 check (altura_cm >= 0),
  comprimento_cm numeric(10,1) default 0 check (comprimento_cm >= 0),
  diametro_cm numeric(10,1) default 0 check (diametro_cm >= 0),

  -- Estoque
  controla_estoque boolean not null default true,
  estoque_min numeric(14,3) default 0 check (estoque_min >= 0),
  estoque_max numeric(14,3) default 0 check (estoque_max >= 0),
  controlar_lotes boolean not null default false,
  localizacao text,
  dias_preparacao int default 0 check (dias_preparacao between 0 and 365),

  -- Relacionamentos opcionais
  marca_id uuid,
  tabela_medidas_id uuid,
  produto_pai_id uuid, -- para variações

  -- SEO/Links/Complementos
  descricao_complementar text,
  video_url text,
  slug text,
  seo_titulo text,
  seo_descricao text,
  keywords text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- CHECKs condicionais da embalagem
  constraint ck_env_pack_dims check (
    case
      when tipo_embalagem = 'pacote_caixa' then largura_cm is not null and altura_cm is not null and comprimento_cm is not null
      when tipo_embalagem = 'envelope'     then largura_cm is not null and comprimento_cm is not null
      when tipo_embalagem = 'rolo_cilindro' then comprimento_cm is not null and diametro_cm is not null
      else true
    end
  ),

  -- relacionamento de variante/kit
  constraint fk_produto_pai foreign key (produto_pai_id) references public.produtos(id) on delete set null
);

-- Imagens
create table if not exists public.produto_imagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  url text not null,
  ordem int not null default 0,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tags (taxonomia simples)
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_unique_per_company unique (empresa_id, nome)
);

create table if not exists public.produto_tags (
  produto_id uuid not null references public.produtos(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  empresa_id uuid not null,
  primary key (produto_id, tag_id)
);

-- Atributos (ficha técnica)
create table if not exists public.atributos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  tipo text not null default 'text', -- text|number|bool|json
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atributos_unique_per_company unique (empresa_id, nome)
);

create table if not exists public.produto_atributos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  atributo_id uuid not null references public.atributos(id) on delete cascade,
  valor_text text,
  valor_num numeric,
  valor_bool boolean,
  valor_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint produto_atributos_unq unique (empresa_id, produto_id, atributo_id)
);

-- Anúncios / Integrações
create table if not exists public.ecommerces (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ecommerces_unique_per_company unique (empresa_id, nome)
);

create table if not exists public.produto_anuncios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  ecommerce_id uuid not null references public.ecommerces(id) on delete cascade,
  identificador text not null,
  descricao text,
  descricao_complementar text,
  preco_especifico numeric(14,2) check (preco_especifico is null or preco_especifico >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anuncio_identificador_unique unique (ecommerce_id, identificador)
);

-- Componentes (Kits / BOM)
create table if not exists public.produto_componentes (
  kit_id uuid not null references public.produtos(id) on delete cascade,
  componente_id uuid not null references public.produtos(id) on delete restrict,
  empresa_id uuid not null,
  quantidade numeric(14,3) not null check (quantidade > 0),
  primary key (kit_id, componente_id)
);

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

-- Colunas novas em public.produtos (aba “Outros”)
alter table public.produtos
  add column if not exists itens_por_caixa int default 0 check (itens_por_caixa >= 0),
  add column if not exists preco_custo numeric(14,2) check (preco_custo is null or preco_custo >= 0),
  add column if not exists linha_produto_id uuid,
  add column if not exists garantia_meses int check (garantia_meses is null or garantia_meses between 0 and 120),
  add column if not exists markup numeric(10,5) default 0 check (markup >= 0),
  add column if not exists permitir_inclusao_vendas boolean not null default true;

alter table public.produtos
  add column if not exists gtin_tributavel text,
  add column if not exists unidade_tributavel text,
  add column if not exists fator_conversao numeric(14,6) check (fator_conversao is null or fator_conversao > 0),
  add column if not exists codigo_enquadramento_ipi text,
  add column if not exists valor_ipi_fixo numeric(14,2) check (valor_ipi_fixo is null or valor_ipi_fixo >= 0),
  add column if not exists codigo_enquadramento_legal_ipi text,
  add column if not exists ex_tipi text,
  add column if not exists observacoes_internas text;

-- FK opcional (IDEMPOTENTE)
do $$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'fk_produtos_linha_produto'
       and c.conrelid = 'public.produtos'::regclass
  ) then
    alter table public.produtos
      add constraint fk_produtos_linha_produto
      foreign key (linha_produto_id)
      references public.linhas_produto(id)
      on delete set null;
  end if;
end;
$$;

-- Índices
create index if not exists idx_produtos_empresa_status on public.produtos(empresa_id, status);
create unique index if not exists idx_produtos_empresa_sku_unique on public.produtos(empresa_id, sku) where sku is not null;
create unique index if not exists idx_produtos_gtin_unique on public.produtos(gtin) where gtin is not null;
create index if not exists idx_produtos_nome_trgm on public.produtos using gin (nome gin_trgm_ops);
create index if not exists idx_produtos_empresa_slug_unique on public.produtos(empresa_id, slug);

create index if not exists idx_produto_imagens_produto on public.produto_imagens(produto_id);
create index if not exists idx_produto_tags_empresa on public.produto_tags(empresa_id);
create index if not exists idx_produto_atributos_produto on public.produto_atributos(produto_id);
create index if not exists idx_produto_anuncios_produto on public.produto_anuncios(produto_id);
create index if not exists idx_produtos_empresa_linha on public.produtos(empresa_id, linha_produto_id);
create index if not exists idx_produtos_gtin_tributavel on public.produtos(gtin_tributavel);


-- Triggers updated_at
drop trigger if exists set_updated_at_produtos on public.produtos;
create trigger set_updated_at_produtos
before update on public.produtos
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at_produto_imagens on public.produto_imagens;
create trigger set_updated_at_produto_imagens
before update on public.produto_imagens
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at_produto_atributos on public.produto_atributos;
create trigger set_updated_at_produto_atributos
before update on public.produto_atributos
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at_produto_anuncios on public.produto_anuncios;
create trigger set_updated_at_produto_anuncios
before update on public.produto_anuncios
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at_marcas on public.marcas;
create trigger set_updated_at_marcas
before update on public.marcas
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at_tabelas_medidas on public.tabelas_medidas;
create trigger set_updated_at_tabelas_medidas
before update on public.tabelas_medidas
for each row execute function public.tg_set_updated_at();

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

-- RLS
alter table public.produtos enable row level security;
alter table public.produto_imagens enable row level security;
alter table public.tags enable row level security;
alter table public.produto_tags enable row level security;
alter table public.atributos enable row level security;
alter table public.produto_atributos enable row level security;
alter table public.ecommerces enable row level security;
alter table public.produto_anuncios enable row level security;
alter table public.marcas enable row level security;
alter table public.tabelas_medidas enable row level security;
alter table public.produto_componentes enable row level security;
alter table public.linhas_produto enable row level security;
alter table public.fornecedores  enable row level security;
alter table public.produto_fornecedores enable row level security;

-- Helper predicate
create or replace function public.is_tenant_row(p_empresa_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(p_empresa_id, '00000000-0000-0000-0000-000000000000'::uuid) = public.current_empresa_id()
$$;

-- PRODUTOS
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='produtos' and policyname='produtos_sel') then
    create policy produtos_sel on public.produtos for select using (public.is_tenant_row(empresa_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='produtos' and policyname='produtos_ins') then
    create policy produtos_ins on public.produtos for insert with check (public.is_tenant_row(empresa_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='produtos' and policyname='produtos_upd') then
    create policy produtos_upd on public.produtos for update using (public.is_tenant_row(empresa_id)) with check (public.is_tenant_row(empresa_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='produtos' and policyname='produtos_del') then
    create policy produtos_del on public.produtos for delete using (public.is_tenant_row(empresa_id));
  end if;
end;
$$;

-- Políticas para tabelas filhas
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
end;
$$;

-- Guard anti cross-tenant
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

-- RPCs
create or replace function public.validate_fiscais(ncm_in text, cest_in text)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if ncm_in is not null and ncm_in !~ '^\d{8}$|^\d{4}\.\d{2}\.\d{2}$' then
    raise exception '[RPC][VALIDATE] NCM inválido: %', ncm_in using errcode = '22000';
  end if;
  if cest_in is not null and cest_in !~ '^\d{7}$|^\d{2}\.\d{3}\.\d{3}$' then
    raise exception '[RPC][VALIDATE] CEST inválido: %', cest_in using errcode = '22000';
  end if;
end;
$$;

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

create or replace function public.update_product_for_current_user(p_id uuid, patch jsonb)
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

  if patch ? 'ncm' or patch ? 'cest' then
    perform public.validate_fiscais(patch->>'ncm', patch->>'cest');
  end if;

  update public.produtos p
     set
       tipo = coalesce((patch->>'tipo')::public.tipo_produto, p.tipo),
       status = coalesce((patch->>'status')::public.status_produto, p.status),
       nome = coalesce(patch->>'nome', p.nome),
       descricao = coalesce(patch->>'descricao', p.descricao),
       sku = coalesce(nullif(patch->>'sku',''), p.sku),
       gtin = coalesce(nullif(patch->>'gtin',''), p.gtin),
       unidade = coalesce(patch->>'unidade', p.unidade),
       preco_venda = coalesce((patch->>'preco_venda')::numeric, p.preco_venda),
       moeda = coalesce(patch->>'moeda', p.moeda),
       icms_origem = coalesce((patch->>'icms_origem')::int2, p.icms_origem),
       ncm = coalesce(nullif(patch->>'ncm',''), p.ncm),
       cest = coalesce(nullif(patch->>'cest',''), p.cest),
       tipo_embalagem = coalesce((patch->>'tipo_embalagem')::public.tipo_embalagem, p.tipo_embalagem),
       embalagem = coalesce(nullif(patch->>'embalagem',''), p.embalagem),
       peso_liquido_kg = coalesce((patch->>'peso_liquido_kg')::numeric, p.peso_liquido_kg),
       peso_bruto_kg  = coalesce((patch->>'peso_bruto_kg')::numeric, p.peso_bruto_kg),
       num_volumes = coalesce((patch->>'num_volumes')::int, p.num_volumes),
       largura_cm = coalesce((patch->>'largura_cm')::numeric, p.largura_cm),
       altura_cm = coalesce((patch->>'altura_cm')::numeric, p.altura_cm),
       comprimento_cm = coalesce((patch->>'comprimento_cm')::numeric, p.comprimento_cm),
       diametro_cm = coalesce((patch->>'diametro_cm')::numeric, p.diametro_cm),
       controla_estoque = coalesce((patch->>'controla_estoque')::boolean, p.controla_estoque),
       estoque_min = coalesce((patch->>'estoque_min')::numeric, p.estoque_min),
       estoque_max = coalesce((patch->>'estoque_max')::numeric, p.estoque_max),
       controlar_lotes = coalesce((patch->>'controlar_lotes')::boolean, p.controlar_lotes),
       localizacao = coalesce(nullif(patch->>'localizacao',''), p.localizacao),
       dias_preparacao = coalesce((patch->>'dias_preparacao')::int, p.dias_preparacao),
       marca_id = coalesce((patch->>'marca_id')::uuid, p.marca_id),
       tabela_medidas_id = coalesce((patch->>'tabela_medidas_id')::uuid, p.tabela_medidas_id),
       produto_pai_id = coalesce((patch->>'produto_pai_id')::uuid, p.produto_pai_id),
       descricao_complementar = coalesce(patch->>'descricao_complementar', p.descricao_complementar),
       video_url = coalesce(nullif(patch->>'video_url',''), p.video_url),
       slug = coalesce(nullif(patch->>'slug',''), p.slug),
       seo_titulo = coalesce(nullif(patch->>'seo_titulo',''), p.seo_titulo),
       seo_descricao = coalesce(nullif(patch->>'seo_descricao',''), p.seo_descricao),
       keywords = coalesce(nullif(patch->>'keywords',''), p.keywords),
       itens_por_caixa = coalesce((patch->>'itens_por_caixa')::int, p.itens_por_caixa),
       preco_custo = coalesce((patch->>'preco_custo')::numeric, p.preco_custo),
       linha_produto_id = coalesce((patch->>'linha_produto_id')::uuid, p.linha_produto_id),
       garantia_meses = coalesce((patch->>'garantia_meses')::int, p.garantia_meses),
       markup = coalesce((patch->>'markup')::numeric, p.markup),
       permitir_inclusao_vendas = coalesce((patch->>'permitir_inclusao_vendas')::boolean, p.permitir_inclusao_vendas),
       gtin_tributavel = coalesce(nullif(patch->>'gtin_tributavel',''), p.gtin_tributavel),
       unidade_tributavel = coalesce(nullif(patch->>'unidade_tributavel',''), p.unidade_tributavel),
       fator_conversao = coalesce((patch->>'fator_conversao')::numeric, p.fator_conversao),
       codigo_enquadramento_ipi = coalesce(nullif(patch->>'codigo_enquadramento_ipi',''), p.codigo_enquadramento_ipi),
       valor_ipi_fixo = coalesce((patch->>'valor_ipi_fixo')::numeric, p.valor_ipi_fixo),
       codigo_enquadramento_legal_ipi = coalesce(nullif(patch->>'codigo_enquadramento_legal_ipi',''), p.codigo_enquadramento_legal_ipi),
       ex_tipi = coalesce(nullif(patch->>'ex_tipi',''), p.ex_tipi),
       observacoes_internas = coalesce(patch->>'observacoes_internas', p.observacoes_internas)
   where p.id = p_id
     and p.empresa_id = v_empresa_id
  returning * into v_prod;

  if not found then
    raise exception '[RPC][UPDATE_PRODUCT] produto não encontrado na empresa atual' using errcode = 'NO_DATA_FOUND';
  end if;

  return v_prod;
end;
$$;
