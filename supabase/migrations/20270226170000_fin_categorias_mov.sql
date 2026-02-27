/*
  FIN-CAT-01 — Categorias de movimentação + bootstrap DRE estado da arte

  Problema
  - `financeiro_movimentacoes.categoria` era texto livre → usuários digitavam
    coisas distintas ("tarifas", "Tarifas", "tarifa") → DRE sem mapeamento.
  - Sem mapeamentos em `financeiro_dre_mapeamentos`, tudo ia para `unmapped`.

  Solução
  - Tabela `financeiro_categorias_mov` com categorias padronizadas por empresa.
  - Seed automático de 15 categorias padrão com `dre_linha_key` pré-definida,
    incluindo backfill dos mapeamentos em `financeiro_dre_mapeamentos`.
  - Trigger AFTER INSERT na tabela `empresas` garante que toda nova empresa
    receba as categorias automaticamente.
  - RPCs: list (dropdown Tesouraria), upsert (admin), delete.

  Multi-tenant / Segurança
  - SECURITY DEFINER + set search_path (padrão do repo).
  - RLS em `financeiro_categorias_mov` (empresa_id = current_empresa_id()).
  - Permissões: authenticated, service_role.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabela: financeiro_categorias_mov
-- -----------------------------------------------------------------------------

create table if not exists public.financeiro_categorias_mov (
  id             uuid        primary key default gen_random_uuid(),
  empresa_id     uuid        not null,
  nome           text        not null,
  tipo           text        not null default 'ambos'
                               check (tipo in ('entrada','saida','ambos')),
  dre_linha_key  text,       -- NULL = usa fallback automático do report
  is_system      boolean     not null default false,
  ativo          boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint fin_cat_mov_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_cat_mov_empresa_nome_uk
    unique (empresa_id, nome)
);

create index if not exists idx_fin_cat_mov_empresa
  on public.financeiro_categorias_mov (empresa_id);

-- updated_at automático
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_financeiro_categorias_mov'
      and tgrelid = 'public.financeiro_categorias_mov'::regclass
  ) then
    create trigger handle_updated_at_financeiro_categorias_mov
      before update on public.financeiro_categorias_mov
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) RLS
-- -----------------------------------------------------------------------------

alter table public.financeiro_categorias_mov enable row level security;

drop policy if exists fin_cat_mov_select on public.financeiro_categorias_mov;
drop policy if exists fin_cat_mov_insert on public.financeiro_categorias_mov;
drop policy if exists fin_cat_mov_update on public.financeiro_categorias_mov;
drop policy if exists fin_cat_mov_delete on public.financeiro_categorias_mov;

create policy fin_cat_mov_select
  on public.financeiro_categorias_mov
  for select
  using (empresa_id = public.current_empresa_id());

create policy fin_cat_mov_insert
  on public.financeiro_categorias_mov
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy fin_cat_mov_update
  on public.financeiro_categorias_mov
  for update
  using  (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy fin_cat_mov_delete
  on public.financeiro_categorias_mov
  for delete
  using (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- 3) RPC: listar categorias (dropdown Tesouraria)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_categorias_mov_list(text, boolean);
create or replace function public.financeiro_categorias_mov_list(
  p_tipo   text    default null,
  p_ativo  boolean default true
)
returns table (
  id            uuid,
  nome          text,
  tipo          text,
  dre_linha_key text,
  is_system     boolean,
  ativo         boolean
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    c.id,
    c.nome,
    c.tipo,
    c.dre_linha_key,
    c.is_system,
    c.ativo
  from public.financeiro_categorias_mov c
  where c.empresa_id = public.current_empresa_id()
    and (p_ativo is null or c.ativo = p_ativo)
    and (
      p_tipo is null
      or c.tipo = 'ambos'
      or c.tipo = p_tipo
    )
  order by
    case c.tipo
      when 'entrada' then 1
      when 'saida'   then 2
      when 'ambos'   then 3
      else 4
    end,
    c.nome asc;
$$;

revoke all on function public.financeiro_categorias_mov_list(text, boolean) from public;
grant execute on function public.financeiro_categorias_mov_list(text, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RPC: criar/atualizar categoria + sync DRE mapeamentos
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_categorias_mov_upsert(uuid, text, text, text);
create or replace function public.financeiro_categorias_mov_upsert(
  p_nome          text,
  p_tipo          text    default 'ambos',
  p_dre_linha_key text    default null,
  p_id            uuid    default null
)
returns table (
  id            uuid,
  nome          text,
  tipo          text,
  dre_linha_key text,
  is_system     boolean,
  ativo         boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_nome    text := nullif(btrim(p_nome), '');
  v_tipo    text := coalesce(nullif(btrim(p_tipo), ''), 'ambos');
  v_key     text := nullif(btrim(p_dre_linha_key), '');
  v_allowed_keys text[] := array[
    'receita_bruta',
    'deducoes_impostos',
    'cmv_cpv_csp',
    'despesas_operacionais_adm',
    'despesas_operacionais_comerciais',
    'despesas_operacionais_gerais',
    'depreciacao_amortizacao',
    'resultado_financeiro',
    'outras_receitas_despesas',
    'irpj_csll'
  ];
  v_id uuid;
begin
  if v_empresa is null then
    raise exception '[FIN][CAT] empresa_id inválido' using errcode = '42501';
  end if;

  if v_nome is null then
    raise exception 'nome é obrigatório';
  end if;

  if v_tipo not in ('entrada','saida','ambos') then
    raise exception 'tipo inválido (esperado: entrada|saida|ambos)';
  end if;

  if v_key is not null and not (v_key = any(v_allowed_keys)) then
    raise exception 'dre_linha_key inválida';
  end if;

  -- Não permite editar categorias de sistema via esta RPC pública
  if p_id is not null then
    if exists (
      select 1 from public.financeiro_categorias_mov
      where id = p_id and empresa_id = v_empresa and is_system = true
    ) then
      raise exception 'Categorias de sistema não podem ser editadas';
    end if;
  end if;

  -- Upsert da categoria
  insert into public.financeiro_categorias_mov
    (empresa_id, nome, tipo, dre_linha_key, is_system, ativo)
  values
    (v_empresa, v_nome, v_tipo, v_key, false, true)
  on conflict on constraint fin_cat_mov_empresa_nome_uk
  do update set
    tipo          = excluded.tipo,
    dre_linha_key = excluded.dre_linha_key,
    ativo         = true,
    updated_at    = now()
  returning public.financeiro_categorias_mov.id into v_id;

  -- Sync: se dre_linha_key definida → upsert em financeiro_dre_mapeamentos
  if v_key is not null then
    insert into public.financeiro_dre_mapeamentos
      (empresa_id, origem_tipo, origem_valor, dre_linha_key)
    values
      (v_empresa, 'mov_categoria', v_nome, v_key)
    on conflict on constraint fin_dre_map_empresa_origem_uk
    do update set
      dre_linha_key = excluded.dre_linha_key,
      updated_at    = now();
  else
    -- Remove mapeamento explícito se existir (deixa fallback por tipo_mov agir)
    delete from public.financeiro_dre_mapeamentos
    where empresa_id = v_empresa
      and origem_tipo = 'mov_categoria'
      and origem_valor = v_nome;
  end if;

  return query
    select c.id, c.nome, c.tipo, c.dre_linha_key, c.is_system, c.ativo
    from public.financeiro_categorias_mov c
    where c.id = v_id;
end;
$$;

revoke all on function public.financeiro_categorias_mov_upsert(text, text, text, uuid) from public;
grant execute on function public.financeiro_categorias_mov_upsert(text, text, text, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) RPC: deletar categoria (somente não-sistema)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_categorias_mov_delete(uuid);
create or replace function public.financeiro_categorias_mov_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_nome    text;
  v_system  boolean;
begin
  if v_empresa is null then
    raise exception '[FIN][CAT] empresa_id inválido' using errcode = '42501';
  end if;

  select nome, is_system
  into v_nome, v_system
  from public.financeiro_categorias_mov
  where id = p_id and empresa_id = v_empresa;

  if not found then
    raise exception 'Categoria não encontrada';
  end if;

  if v_system then
    raise exception 'Categorias de sistema não podem ser excluídas';
  end if;

  -- Soft delete
  update public.financeiro_categorias_mov
  set ativo = false, updated_at = now()
  where id = p_id and empresa_id = v_empresa;

  -- Remove mapeamento DRE correspondente
  delete from public.financeiro_dre_mapeamentos
  where empresa_id = v_empresa
    and origem_tipo = 'mov_categoria'
    and origem_valor = v_nome;
end;
$$;

revoke all on function public.financeiro_categorias_mov_delete(uuid) from public;
grant execute on function public.financeiro_categorias_mov_delete(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6) Função de seed: popula categorias padrão + mapeamentos DRE
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_categorias_mov_seed(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := p_empresa_id;
begin
  if v_empresa is null then
    return;
  end if;

  -- ── Categorias de ENTRADA ──────────────────────────────────────────────────
  insert into public.financeiro_categorias_mov
    (empresa_id, nome, tipo, dre_linha_key, is_system, ativo)
  values
    (v_empresa, 'Vendas de Produtos',   'entrada', 'receita_bruta',          true, true),
    (v_empresa, 'Serviços Prestados',   'entrada', 'receita_bruta',          true, true),
    (v_empresa, 'Receita de Aluguel',   'entrada', 'receita_bruta',          true, true),
    (v_empresa, 'Receitas Financeiras', 'entrada', 'resultado_financeiro',   true, true),
    (v_empresa, 'Outras Receitas',      'entrada', 'outras_receitas_despesas', true, true)
  on conflict on constraint fin_cat_mov_empresa_nome_uk do nothing;

  -- ── Categorias de SAÍDA ───────────────────────────────────────────────────
  insert into public.financeiro_categorias_mov
    (empresa_id, nome, tipo, dre_linha_key, is_system, ativo)
  values
    (v_empresa, 'Custo de Mercadorias',      'saida', 'cmv_cpv_csp',                      true, true),
    (v_empresa, 'Folha de Pagamento',         'saida', 'despesas_operacionais_adm',        true, true),
    (v_empresa, 'Aluguel',                    'saida', 'despesas_operacionais_gerais',     true, true),
    (v_empresa, 'Energia / Água / Telefone',  'saida', 'despesas_operacionais_gerais',     true, true),
    (v_empresa, 'Impostos e Tributos',        'saida', 'irpj_csll',                        true, true),
    (v_empresa, 'Despesas Administrativas',   'saida', 'despesas_operacionais_adm',        true, true),
    (v_empresa, 'Despesas Financeiras',       'saida', 'resultado_financeiro',             true, true),
    (v_empresa, 'Marketing e Publicidade',    'saida', 'despesas_operacionais_comerciais', true, true),
    (v_empresa, 'Manutenção e Reparos',       'saida', 'despesas_operacionais_gerais',     true, true),
    (v_empresa, 'Outras Despesas',            'saida', 'outras_receitas_despesas',         true, true)
  on conflict on constraint fin_cat_mov_empresa_nome_uk do nothing;

  -- ── Sync: cria/atualiza mapeamentos DRE para as categorias com dre_linha_key ──
  insert into public.financeiro_dre_mapeamentos
    (empresa_id, origem_tipo, origem_valor, dre_linha_key)
  select
    v_empresa,
    'mov_categoria',
    c.nome,
    c.dre_linha_key
  from public.financeiro_categorias_mov c
  where c.empresa_id = v_empresa
    and c.dre_linha_key is not null
  on conflict on constraint fin_dre_map_empresa_origem_uk
  do update set
    dre_linha_key = excluded.dre_linha_key,
    updated_at    = now();
end;
$$;

revoke all on function public.financeiro_categorias_mov_seed(uuid) from public, anon;
grant execute on function public.financeiro_categorias_mov_seed(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7) Backfill de empresas existentes
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  if to_regclass('public.empresas') is null then
    return;
  end if;

  for r in select id from public.empresas loop
    perform public.financeiro_categorias_mov_seed(r.id);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 8) Trigger: seed automático ao criar nova empresa
-- -----------------------------------------------------------------------------

drop function if exists public.tg_fin_categorias_mov_seed();
create or replace function public.tg_fin_categorias_mov_seed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.financeiro_categorias_mov_seed(new.id);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.empresas') is null then
    return;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_empresas_fin_cat_mov_seed'
      and tgrelid = 'public.empresas'::regclass
  ) then
    create trigger tg_empresas_fin_cat_mov_seed
      after insert on public.empresas
      for each row
      execute procedure public.tg_fin_categorias_mov_seed();
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
