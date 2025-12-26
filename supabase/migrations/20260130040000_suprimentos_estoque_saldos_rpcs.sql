/*
  Suprimentos/Estoque (camada de saldos + RPCs públicas)

  Objetivo:
  - Garantir que o módulo "Controle de Estoque" funcione em DB limpo (CI/verify).
  - Centralizar saldo atual em `public.estoque_saldos` (snapshot por produto).
  - Manter kardex em `public.estoque_movimentos`.
  - Expor RPCs usadas pelo frontend:
      - suprimentos_list_posicao_estoque
      - suprimentos_get_kardex
      - suprimentos_registrar_movimento
*/

BEGIN;

create schema if not exists public;

-- -----------------------------------------------------------------------------
-- 0) Compat: garantir colunas esperadas em estoque_movimentos
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.estoque_movimentos') is null then
    return;
  end if;

  alter table public.estoque_movimentos
    add column if not exists tipo text,
    add column if not exists quantidade numeric(18,4),
    add column if not exists saldo_anterior numeric(18,4),
    add column if not exists saldo_atual numeric(18,4),
    add column if not exists custo_medio numeric(18,6),
    add column if not exists origem text,
    add column if not exists observacoes text,
    add column if not exists created_at timestamptz default now(),
    add column if not exists updated_at timestamptz default now(),
    add column if not exists origem_tipo text,
    add column if not exists origem_id uuid,
    add column if not exists tipo_mov text,
    add column if not exists lote text,
    add column if not exists data_movimento date default current_date,
    add column if not exists valor_unitario numeric(18,6);
exception when others then
  -- best-effort: evita travar em ambientes com drift
  null;
end $$;

-- -----------------------------------------------------------------------------
-- 1) Snapshot: estoque_saldos
-- -----------------------------------------------------------------------------
create table if not exists public.estoque_saldos (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  produto_id uuid not null,
  saldo numeric(15,4) not null default 0,
  custo_medio numeric(15,4) not null default 0,
  updated_at timestamptz default now(),
  constraint estoque_saldos_pkey primary key (id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'estoque_saldos_unique_produto'
      and conrelid = 'public.estoque_saldos'::regclass
  ) then
    alter table public.estoque_saldos
      add constraint estoque_saldos_unique_produto unique (empresa_id, produto_id);
  end if;
exception when undefined_table then
  null;
end $$;

do $$
begin
  if to_regclass('public.empresas') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'estoque_saldos_empresa_fkey'
        and conrelid = 'public.estoque_saldos'::regclass
    ) then
      alter table public.estoque_saldos
        add constraint estoque_saldos_empresa_fkey
        foreign key (empresa_id) references public.empresas(id) on delete cascade;
    end if;
  end if;
  if to_regclass('public.produtos') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'estoque_saldos_produto_fkey'
        and conrelid = 'public.estoque_saldos'::regclass
    ) then
      alter table public.estoque_saldos
        add constraint estoque_saldos_produto_fkey
        foreign key (produto_id) references public.produtos(id) on delete cascade;
    end if;
  end if;
exception when others then
  null;
end $$;

create index if not exists idx_estoque_saldos_empresa_produto on public.estoque_saldos(empresa_id, produto_id);

alter table public.estoque_saldos enable row level security;

drop policy if exists "estoque_saldos_select" on public.estoque_saldos;
create policy "estoque_saldos_select" on public.estoque_saldos
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists "estoque_saldos_write" on public.estoque_saldos;
create policy "estoque_saldos_write" on public.estoque_saldos
  for all to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_estoque_saldos'
      and tgrelid = 'public.estoque_saldos'::regclass
  ) then
    create trigger handle_updated_at_estoque_saldos
      before update on public.estoque_saldos
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) RPC: listar posição de estoque (usa estoque_saldos + produtos)
-- -----------------------------------------------------------------------------
drop function if exists public.suprimentos_list_posicao_estoque(text, boolean);
create or replace function public.suprimentos_list_posicao_estoque(
  p_search text default null,
  p_baixo_estoque boolean default false
)
returns table (
  produto_id uuid,
  nome text,
  sku text,
  unidade text,
  saldo numeric,
  custo_medio numeric,
  estoque_min numeric,
  status_estoque text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  return query
  select
    p.id as produto_id,
    p.nome,
    p.sku,
    coalesce(p.unidade, 'un') as unidade,
    coalesce(s.saldo, 0) as saldo,
    coalesce(s.custo_medio, 0) as custo_medio,
    p.estoque_minimo as estoque_min,
    case
      when coalesce(s.saldo,0) <= 0 then 'zerado'
      when p.estoque_minimo is not null and coalesce(s.saldo,0) <= p.estoque_minimo then 'baixo'
      else 'ok'
    end as status_estoque
  from public.produtos p
  left join public.estoque_saldos s
    on s.empresa_id = v_emp and s.produto_id = p.id
  where p.empresa_id = v_emp
    and coalesce(p.controlar_estoque, true) = true
    and (
      p_search is null
      or btrim(p_search) = ''
      or lower(p.nome) like '%'||lower(p_search)||'%'
      or lower(coalesce(p.sku,'')) like '%'||lower(p_search)||'%'
      or lower(coalesce(p.codigo,'')) like '%'||lower(p_search)||'%'
    )
    and (
      not coalesce(p_baixo_estoque,false)
      or coalesce(s.saldo,0) <= coalesce(nullif(p.estoque_minimo, 0), 0)
    )
  order by p.nome asc;
end;
$$;

revoke all on function public.suprimentos_list_posicao_estoque(text, boolean) from public, anon;
grant execute on function public.suprimentos_list_posicao_estoque(text, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) RPC: kardex
-- -----------------------------------------------------------------------------
drop function if exists public.suprimentos_get_kardex(uuid, integer);
create or replace function public.suprimentos_get_kardex(
  p_produto_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  tipo text,
  quantidade numeric,
  saldo_anterior numeric,
  saldo_novo numeric,
  documento_ref text,
  observacao text,
  created_at timestamptz,
  usuario_email text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  return query
  select
    m.id,
    coalesce(m.tipo, m.tipo_mov, 'ajuste') as tipo,
    coalesce(m.quantidade, 0) as quantidade,
    coalesce(m.saldo_anterior, 0) as saldo_anterior,
    coalesce(m.saldo_atual, 0) as saldo_novo,
    nullif(m.origem::text, '') as documento_ref,
    nullif(m.observacoes, '') as observacao,
    m.created_at,
    null::text as usuario_email
  from public.estoque_movimentos m
  where m.empresa_id = v_emp
    and m.produto_id = p_produto_id
  order by m.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
end;
$$;

revoke all on function public.suprimentos_get_kardex(uuid, integer) from public, anon;
grant execute on function public.suprimentos_get_kardex(uuid, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RPC: registrar movimento manual (atualiza estoque_saldos + estoque_lotes SEM_LOTE)
-- -----------------------------------------------------------------------------
drop function if exists public.suprimentos_registrar_movimento(uuid, text, numeric, numeric, text, text);
create or replace function public.suprimentos_registrar_movimento(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_custo_unitario numeric default null,
  p_documento_ref text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_saldo_anterior numeric := 0;
  v_saldo_novo numeric := 0;
  v_fator int := 1;
  v_mov_id uuid;
  v_lote text := 'SEM_LOTE';
  v_custo_ant numeric := 0;
  v_custo_novo numeric := 0;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade deve ser maior que zero.';
  end if;

  if p_tipo in ('saida', 'ajuste_saida', 'perda') then
    v_fator := -1;
  end if;

  -- lock saldo row (cria se não existir)
  select saldo, custo_medio
    into v_saldo_anterior, v_custo_ant
  from public.estoque_saldos
  where empresa_id = v_emp and produto_id = p_produto_id
  for update;

  if not found then
    insert into public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
    values (v_emp, p_produto_id, 0, 0)
    on conflict (empresa_id, produto_id) do nothing;
    v_saldo_anterior := 0;
    v_custo_ant := 0;
  end if;

  v_saldo_novo := v_saldo_anterior + (p_quantidade * v_fator);

  if p_tipo = 'entrada' and p_custo_unitario is not null and v_saldo_novo > 0 then
    v_custo_novo := ((v_saldo_anterior * v_custo_ant) + (p_quantidade * p_custo_unitario)) / v_saldo_novo;
  else
    v_custo_novo := v_custo_ant;
  end if;

  update public.estoque_saldos
  set saldo = v_saldo_novo, custo_medio = v_custo_novo, updated_at = now()
  where empresa_id = v_emp and produto_id = p_produto_id;

  -- best-effort: atualiza estoque_lotes (SEM_LOTE) para manter compat com reservas
  begin
    if v_fator > 0 then
      insert into public.estoque_lotes (empresa_id, produto_id, lote, saldo)
      values (v_emp, p_produto_id, v_lote, p_quantidade)
      on conflict (empresa_id, produto_id, lote)
      do update set saldo = public.estoque_lotes.saldo + excluded.saldo, updated_at = now();
    else
      update public.estoque_lotes
      set saldo = greatest(coalesce(saldo,0) - p_quantidade, 0),
          updated_at = now()
      where empresa_id = v_emp and produto_id = p_produto_id and lote = v_lote;
    end if;
  exception when undefined_table then
    null;
  end;

  insert into public.estoque_movimentos (
    empresa_id,
    produto_id,
    data_movimento,
    tipo,
    tipo_mov,
    quantidade,
    saldo_anterior,
    saldo_atual,
    custo_medio,
    origem_tipo,
    origem_id,
    origem,
    lote,
    observacoes
  )
  values (
    v_emp,
    p_produto_id,
    current_date,
    p_tipo,
    case
      when p_tipo = 'entrada' then 'ajuste_entrada'
      when p_tipo = 'saida' then 'ajuste_saida'
      else p_tipo
    end,
    p_quantidade,
    v_saldo_anterior,
    v_saldo_novo,
    v_custo_novo,
    'suprimentos_manual',
    null,
    p_documento_ref,
    v_lote,
    p_observacao
  )
  returning id into v_mov_id;

  return jsonb_build_object('movimento_id', v_mov_id, 'novo_saldo', v_saldo_novo);
end;
$$;

revoke all on function public.suprimentos_registrar_movimento(uuid, text, numeric, numeric, text, text) from public, anon;
grant execute on function public.suprimentos_registrar_movimento(uuid, text, numeric, numeric, text, text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

COMMIT;
