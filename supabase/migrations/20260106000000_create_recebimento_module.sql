/*
  # Recebimento Module (NFe Verification)
  
  ## Description
  Creates the schema for the Receiving process, acting as a gatekeeper between NFe Import and Stock Entry.
  
  ## Tables
  1. recebimentos: The receiving process header, linked to fiscal_nfe_imports.
  2. recebimento_itens: Items to be checked, linked to fiscal_nfe_import_items.
  3. recebimento_conferencias: Log of physical counts (Blind Check).

  ## Security
  - RLS enabled on all tables.
  - Policies for authenticated users (scoped by empresa_id).
*/

-- =============================================
-- 1. Recebimentos (Header)
-- =============================================
create table if not exists public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  fiscal_nfe_import_id uuid not null, -- Link to the raw XML import
  
  status text not null default 'pendente' 
    check (status in ('pendente', 'em_conferencia', 'divergente', 'concluido', 'cancelado')),
  
  data_recebimento timestamptz default now(),
  responsavel_id uuid references auth.users(id),
  observacao text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint recebimentos_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint recebimentos_import_fkey foreign key (fiscal_nfe_import_id) references public.fiscal_nfe_imports(id) on delete cascade,
  constraint recebimentos_import_unique unique (empresa_id, fiscal_nfe_import_id)
);

-- =============================================
-- 2. Recebimento Itens (Items to Check)
-- =============================================
create table if not exists public.recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  recebimento_id uuid not null,
  fiscal_nfe_item_id uuid not null, -- Link to raw item
  
  produto_id uuid, -- Matched internal product
  
  quantidade_xml numeric(15,4) not null,
  quantidade_conferida numeric(15,4) default 0,
  
  status text not null default 'pendente'
    check (status in ('pendente', 'ok', 'divergente')),
    
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint recebimento_itens_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint recebimento_itens_recebimento_fkey foreign key (recebimento_id) references public.recebimentos(id) on delete cascade,
  constraint recebimento_itens_fiscal_item_fkey foreign key (fiscal_nfe_item_id) references public.fiscal_nfe_import_items(id) on delete cascade,
  constraint recebimento_itens_produto_fkey foreign key (produto_id) references public.produtos(id) on delete set null
);

-- =============================================
-- 3. Recebimento Conferencias (Blind Check Log)
-- =============================================
create table if not exists public.recebimento_conferencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  recebimento_item_id uuid not null,
  
  quantidade_contada numeric(15,4) not null,
  usuario_id uuid default public.current_user_id(),
  
  created_at timestamptz default now(),

  constraint recebimento_conf_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint recebimento_conf_item_fkey foreign key (recebimento_item_id) references public.recebimento_itens(id) on delete cascade
);

-- =============================================
-- 4. Indexes
-- =============================================
create index if not exists idx_recebimentos_empresa_status on public.recebimentos(empresa_id, status);
create index if not exists idx_recebimentos_import on public.recebimentos(fiscal_nfe_import_id);
create index if not exists idx_recebimento_itens_recebimento on public.recebimento_itens(recebimento_id);
create index if not exists idx_recebimento_itens_produto on public.recebimento_itens(produto_id);

-- =============================================
-- 5. RLS Policies
-- =============================================
alter table public.recebimentos enable row level security;
alter table public.recebimento_itens enable row level security;
alter table public.recebimento_conferencias enable row level security;

-- Recebimentos
create policy "recebimentos_all" on public.recebimentos
  for all using (empresa_id = public.current_empresa_id());

-- Itens
create policy "recebimento_itens_all" on public.recebimento_itens
  for all using (empresa_id = public.current_empresa_id());

-- Conferencias
create policy "recebimento_conferencias_all" on public.recebimento_conferencias
  for all using (empresa_id = public.current_empresa_id());

-- =============================================
-- 6. Triggers (Updated At)
-- =============================================
create trigger handle_updated_at_recebimentos
  before update on public.recebimentos
  for each row execute procedure public.tg_set_updated_at();

create trigger handle_updated_at_recebimento_itens
  before update on public.recebimento_itens
  for each row execute procedure public.tg_set_updated_at();
