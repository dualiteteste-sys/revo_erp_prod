/*
  NFE-01: Modelos/tabelas internas + UI base (rascunho NF-e)

  Objetivo:
  - Persistir itens de rascunho (produtos, quantidades, valores) em tabelas normalizadas.
  - Manter totais básicos no cabeçalho (produtos/desconto/frete/impostos/total).
  - Preparar para evoluir para cálculo fiscal (NFE-04) e integração (NFE-05).
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Extensões / helpers
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 2) Campos de totais no cabeçalho (fiscal_nfe_emissoes)
-- ---------------------------------------------------------------------------
alter table if exists public.fiscal_nfe_emissoes
  add column if not exists total_produtos numeric not null default 0,
  add column if not exists total_descontos numeric not null default 0,
  add column if not exists total_frete numeric not null default 0,
  add column if not exists total_impostos numeric not null default 0,
  add column if not exists total_nfe numeric not null default 0;

-- Backfill leve (não destrutivo)
update public.fiscal_nfe_emissoes
set
  total_nfe = coalesce(total_nfe, 0),
  total_produtos = coalesce(total_produtos, 0),
  total_descontos = coalesce(total_descontos, 0),
  total_frete = coalesce(total_frete, 0),
  total_impostos = coalesce(total_impostos, 0)
where true;

-- Mantém compat: `valor_total` continua sendo o total final
update public.fiscal_nfe_emissoes
set valor_total = total_nfe
where valor_total is distinct from total_nfe;

-- ---------------------------------------------------------------------------
-- 3) Itens do rascunho
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_nfe_emissao_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  emissao_id uuid not null references public.fiscal_nfe_emissoes(id) on delete cascade,
  produto_id uuid null references public.produtos(id) on delete set null,
  ordem integer not null default 1,
  descricao text null,
  ncm text null,
  cfop text null,
  cst text null,
  csosn text null,
  quantidade numeric not null default 1,
  unidade text null,
  valor_unitario numeric not null default 0,
  valor_desconto numeric not null default 0,
  valor_total numeric not null default 0,
  impostos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_nfe_emissao_itens_qty_check check (quantidade >= 0),
  constraint fiscal_nfe_emissao_itens_val_unit_check check (valor_unitario >= 0),
  constraint fiscal_nfe_emissao_itens_val_desc_check check (valor_desconto >= 0),
  constraint fiscal_nfe_emissao_itens_val_total_check check (valor_total >= 0)
);

alter table public.fiscal_nfe_emissao_itens enable row level security;

drop policy if exists "Enable all access" on public.fiscal_nfe_emissao_itens;
create policy "Enable all access"
  on public.fiscal_nfe_emissao_itens
  for all
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

grant all on table public.fiscal_nfe_emissao_itens to authenticated, service_role;

drop trigger if exists tg_fiscal_nfe_emissao_itens_updated_at on public.fiscal_nfe_emissao_itens;
create trigger tg_fiscal_nfe_emissao_itens_updated_at
before update on public.fiscal_nfe_emissao_itens
for each row execute function public.tg_set_updated_at();

create index if not exists idx_fiscal_nfe_itens_emissao_ordem
  on public.fiscal_nfe_emissao_itens (empresa_id, emissao_id, ordem);

-- ---------------------------------------------------------------------------
-- 4) Recalcular totais do cabeçalho com base nos itens
-- ---------------------------------------------------------------------------
create or replace function public.fiscal_nfe_recalc_totais(p_emissao_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_total_produtos numeric := 0;
  v_total_descontos numeric := 0;
  v_total_frete numeric := 0;
  v_total_impostos numeric := 0;
begin
  if public.is_service_role() then
    -- service_role pode recalcular sem contexto de empresa ativa
    select
      coalesce(sum(i.quantidade * i.valor_unitario), 0),
      coalesce(sum(i.valor_desconto), 0)
    into v_total_produtos, v_total_descontos
    from public.fiscal_nfe_emissao_itens i
    where i.emissao_id = p_emissao_id;

    update public.fiscal_nfe_emissoes e
    set
      total_produtos = v_total_produtos,
      total_descontos = v_total_descontos,
      total_frete = coalesce(e.total_frete, 0),
      total_impostos = coalesce(e.total_impostos, 0),
      total_nfe = greatest(0, v_total_produtos - v_total_descontos + coalesce(e.total_frete, 0) + coalesce(e.total_impostos, 0)),
      valor_total = greatest(0, v_total_produtos - v_total_descontos + coalesce(e.total_frete, 0) + coalesce(e.total_impostos, 0)),
      updated_at = now()
    where e.id = p_emissao_id;
    return;
  end if;

  if v_emp is null then
    return;
  end if;

  -- Segurança: garante que a emissão pertence à empresa ativa
  if not exists (
    select 1
    from public.fiscal_nfe_emissoes e
    where e.id = p_emissao_id
      and e.empresa_id = v_emp
  ) then
    return;
  end if;

  select
    coalesce(sum(i.quantidade * i.valor_unitario), 0),
    coalesce(sum(i.valor_desconto), 0)
  into v_total_produtos, v_total_descontos
  from public.fiscal_nfe_emissao_itens i
  where i.emissao_id = p_emissao_id
    and i.empresa_id = v_emp;

  update public.fiscal_nfe_emissoes e
  set
    total_produtos = v_total_produtos,
    total_descontos = v_total_descontos,
    total_frete = coalesce(e.total_frete, 0),
    total_impostos = coalesce(e.total_impostos, 0),
    total_nfe = greatest(0, v_total_produtos - v_total_descontos + coalesce(e.total_frete, 0) + coalesce(e.total_impostos, 0)),
    valor_total = greatest(0, v_total_produtos - v_total_descontos + coalesce(e.total_frete, 0) + coalesce(e.total_impostos, 0)),
    updated_at = now()
  where e.id = p_emissao_id
    and e.empresa_id = v_emp;
end;
$$;

revoke all on function public.fiscal_nfe_recalc_totais(uuid) from public, anon;
grant execute on function public.fiscal_nfe_recalc_totais(uuid) to authenticated, service_role, postgres;

create or replace function public.tg_fiscal_nfe_itens_recalc_totais()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.fiscal_nfe_recalc_totais(coalesce(new.emissao_id, old.emissao_id));
  return coalesce(new, old);
end;
$$;

revoke all on function public.tg_fiscal_nfe_itens_recalc_totais() from public, anon;
grant execute on function public.tg_fiscal_nfe_itens_recalc_totais() to authenticated, service_role, postgres;

drop trigger if exists tg_fiscal_nfe_itens_recalc on public.fiscal_nfe_emissao_itens;
create trigger tg_fiscal_nfe_itens_recalc
after insert or update or delete on public.fiscal_nfe_emissao_itens
for each row execute function public.tg_fiscal_nfe_itens_recalc_totais();

select pg_notify('pgrst', 'reload schema');

COMMIT;

