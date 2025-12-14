/*
  # Recebimento Module (Canonical)

  Reintroduces the Recebimento (receiving) workflow schema and RPCs as an official Supabase migration.
  This keeps dev/prod in sync without relying on legacy scripts.
*/

-- =============================================
-- 1. Tables
-- =============================================
create table if not exists public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  fiscal_nfe_import_id uuid not null,
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

create table if not exists public.recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  recebimento_id uuid not null,
  fiscal_nfe_item_id uuid not null,
  produto_id uuid,
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

-- Ensure unique (recebimento_item_id, usuario_id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recebimento_conf_unique'
      AND table_schema = 'public'
      AND table_name = 'recebimento_conferencias'
  ) THEN
    ALTER TABLE public.recebimento_conferencias
      ADD CONSTRAINT recebimento_conf_unique UNIQUE (recebimento_item_id, usuario_id);
  END IF;
END $$;

-- =============================================
-- 2. Indexes
-- =============================================
create index if not exists idx_recebimentos_empresa_status on public.recebimentos(empresa_id, status);
create index if not exists idx_recebimentos_import on public.recebimentos(fiscal_nfe_import_id);
create index if not exists idx_recebimento_itens_recebimento on public.recebimento_itens(recebimento_id);
create index if not exists idx_recebimento_itens_produto on public.recebimento_itens(produto_id);

-- =============================================
-- 3. Row Level Security & Policies
-- =============================================
alter table public.recebimentos enable row level security;
alter table public.recebimento_itens enable row level security;
alter table public.recebimento_conferencias enable row level security;

drop policy if exists recebimentos_all on public.recebimentos;
create policy recebimentos_all on public.recebimentos
  for all using (empresa_id = public.current_empresa_id());

drop policy if exists recebimento_itens_all on public.recebimento_itens;
create policy recebimento_itens_all on public.recebimento_itens
  for all using (empresa_id = public.current_empresa_id());

drop policy if exists recebimento_conferencias_all on public.recebimento_conferencias;
create policy recebimento_conferencias_all on public.recebimento_conferencias
  for all using (empresa_id = public.current_empresa_id());

-- =============================================
-- 4. Grants
-- =============================================
grant select, insert, update, delete on table public.recebimentos to authenticated, service_role;
grant select, insert, update, delete on table public.recebimento_itens to authenticated, service_role;
grant select, insert, update, delete on table public.recebimento_conferencias to authenticated, service_role;

-- =============================================
-- 5. Triggers (updated_at)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'handle_updated_at_recebimentos'
  ) THEN
    CREATE TRIGGER handle_updated_at_recebimentos
      BEFORE UPDATE ON public.recebimentos
      FOR EACH ROW EXECUTE PROCEDURE public.tg_set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'handle_updated_at_recebimento_itens'
  ) THEN
    CREATE TRIGGER handle_updated_at_recebimento_itens
      BEFORE UPDATE ON public.recebimento_itens
      FOR EACH ROW EXECUTE PROCEDURE public.tg_set_updated_at();
  END IF;
END $$;

-- =============================================
-- 6. RPCs
-- =============================================
create or replace function public.create_recebimento_from_xml(
  p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_recebimento_id uuid;
  v_item record;
  v_prod_id uuid;
begin
  select id into v_recebimento_id
  from public.recebimentos
  where fiscal_nfe_import_id = p_import_id
    and empresa_id = v_emp;

  if v_recebimento_id is not null then
    return jsonb_build_object('id', v_recebimento_id, 'status', 'exists');
  end if;

  insert into public.recebimentos (empresa_id, fiscal_nfe_import_id, status)
  values (v_emp, p_import_id, 'pendente')
  returning id into v_recebimento_id;

  for v_item in
    select * from public.fiscal_nfe_import_items
    where import_id = p_import_id and empresa_id = v_emp
  loop
    select id into v_prod_id
    from public.produtos p
    where p.empresa_id = v_emp
      and (
        (p.sku = v_item.cprod and coalesce(v_item.cprod,'') <> '') or
        (p.gtin = v_item.ean and coalesce(v_item.ean,'') <> '')
      )
    limit 1;

    insert into public.recebimento_itens (
      empresa_id, recebimento_id, fiscal_nfe_item_id, produto_id, quantidade_xml
    ) values (
      v_emp, v_recebimento_id, v_item.id, v_prod_id, v_item.qcom
    );
  end loop;

  return jsonb_build_object('id', v_recebimento_id, 'status', 'created');
end;
$$;

revoke all on function public.create_recebimento_from_xml(uuid) from public;
grant execute on function public.create_recebimento_from_xml(uuid) to authenticated, service_role;

create or replace function public.conferir_item_recebimento(
  p_recebimento_item_id uuid,
  p_quantidade numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_total numeric;
begin
  insert into public.recebimento_conferencias (
    empresa_id, recebimento_item_id, quantidade_contada, usuario_id
  ) values (
    v_emp, p_recebimento_item_id, p_quantidade, public.current_user_id()
  )
  on conflict (recebimento_item_id, usuario_id)
  do update set
    quantidade_contada = excluded.quantidade_contada,
    created_at = now();

  select sum(quantidade_contada) into v_total
  from public.recebimento_conferencias
  where recebimento_item_id = p_recebimento_item_id;

  update public.recebimento_itens
  set quantidade_conferida = coalesce(v_total, 0),
      updated_at = now()
  where id = p_recebimento_item_id
    and empresa_id = v_emp;

  update public.recebimento_itens
  set status = case 
      when quantidade_conferida >= quantidade_xml then 'ok'
      else 'divergente'
    end
  where id = p_recebimento_item_id
    and empresa_id = v_emp;
end;
$$;

revoke all on function public.conferir_item_recebimento(uuid, numeric) from public;
grant execute on function public.conferir_item_recebimento(uuid, numeric) to authenticated, service_role;

create or replace function public.finalizar_recebimento(
  p_recebimento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_item record;
  v_divergente boolean := false;
  v_import_id uuid;
  v_matches jsonb;
begin
  for v_item in
    select * from public.recebimento_itens
    where recebimento_id = p_recebimento_id and empresa_id = v_emp
  loop
    if v_item.quantidade_conferida <> v_item.quantidade_xml then
      v_divergente := true;
    end if;
  end loop;

  if v_divergente then
    update public.recebimentos set status = 'divergente', updated_at = now()
    where id = p_recebimento_id;
    return jsonb_build_object('status', 'divergente', 'message', 'Existem divergências na conferência.');
  end if;

  select fiscal_nfe_import_id into v_import_id
  from public.recebimentos
  where id = p_recebimento_id;

  select jsonb_agg(
           jsonb_build_object(
             'item_id', ri.fiscal_nfe_item_id,
             'produto_id', ri.produto_id
           )
         )
  into v_matches
  from public.recebimento_itens ri
  where ri.recebimento_id = p_recebimento_id
    and ri.empresa_id = v_emp
    and ri.produto_id is not null;

  perform public.beneficiamento_process_from_import(v_import_id, coalesce(v_matches, '[]'::jsonb));

  update public.recebimentos set status = 'concluido', updated_at = now()
  where id = p_recebimento_id;

  return jsonb_build_object('status', 'concluido', 'message', 'Recebimento finalizado e estoque atualizado.');
end;
$$;

revoke all on function public.finalizar_recebimento(uuid) from public;
grant execute on function public.finalizar_recebimento(uuid) to authenticated, service_role;
