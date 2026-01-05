/*
  SUP-STA-01: Multi-estoque/depósitos + transferências + permissões por local

  Objetivo:
  - Permitir múltiplos depósitos por empresa.
  - Controlar saldo por produto+depósito e registrar kardex por depósito.
  - Adicionar transferência (saída de um depósito + entrada em outro) de forma idempotente.
  - Permissões por local: se houver regras definidas, usuário só vê/movimenta nos depósitos permitidos.

  Compatibilidade:
  - Mantém `estoque_saldos` (saldo total por produto) para telas antigas/relatórios.
  - Novas RPCs V2 aceitam `deposito_id` e mantêm os saldos por depósito.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Depósitos
-- -----------------------------------------------------------------------------
create table if not exists public.estoque_depositos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  codigo text null,
  ativo boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_estoque_depositos_empresa_ativo
  on public.estoque_depositos (empresa_id, ativo, updated_at desc);

create unique index if not exists ux_estoque_depositos_empresa_codigo
  on public.estoque_depositos (empresa_id, codigo)
  where codigo is not null and btrim(codigo) <> '';

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_estoque_depositos_set_updated_at'
      and tgrelid = 'public.estoque_depositos'::regclass
  ) then
    create trigger tg_estoque_depositos_set_updated_at
      before update on public.estoque_depositos
      for each row execute function public.tg_set_updated_at();
  end if;
end$$;

alter table public.estoque_depositos enable row level security;

drop policy if exists estoque_depositos_select on public.estoque_depositos;
create policy estoque_depositos_select
  on public.estoque_depositos
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists estoque_depositos_write on public.estoque_depositos;
create policy estoque_depositos_write
  on public.estoque_depositos
  for all to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.estoque_depositos to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Permissões por depósito (opcional)
-- -----------------------------------------------------------------------------
create table if not exists public.estoque_deposito_usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  deposito_id uuid not null references public.estoque_depositos(id) on delete cascade,
  user_id uuid not null,
  can_view boolean not null default true,
  can_move boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_estoque_deposito_usuarios_unique
  on public.estoque_deposito_usuarios (empresa_id, deposito_id, user_id);

alter table public.estoque_deposito_usuarios enable row level security;

drop policy if exists estoque_deposito_usuarios_select on public.estoque_deposito_usuarios;
create policy estoque_deposito_usuarios_select
  on public.estoque_deposito_usuarios
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists estoque_deposito_usuarios_write on public.estoque_deposito_usuarios;
create policy estoque_deposito_usuarios_write
  on public.estoque_deposito_usuarios
  for all to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.estoque_deposito_usuarios to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Saldos por depósito
-- -----------------------------------------------------------------------------
create table if not exists public.estoque_saldos_depositos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  deposito_id uuid not null references public.estoque_depositos(id) on delete cascade,
  saldo numeric(15,4) not null default 0,
  custo_medio numeric(15,4) not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_estoque_saldos_depositos_unique
  on public.estoque_saldos_depositos (empresa_id, produto_id, deposito_id);

create index if not exists idx_estoque_saldos_depositos_emp_prod
  on public.estoque_saldos_depositos (empresa_id, produto_id);

alter table public.estoque_saldos_depositos enable row level security;

drop policy if exists estoque_saldos_depositos_select on public.estoque_saldos_depositos;
create policy estoque_saldos_depositos_select
  on public.estoque_saldos_depositos
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists estoque_saldos_depositos_write on public.estoque_saldos_depositos;
create policy estoque_saldos_depositos_write
  on public.estoque_saldos_depositos
  for all to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.estoque_saldos_depositos to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_estoque_saldos_depositos_set_updated_at'
      and tgrelid = 'public.estoque_saldos_depositos'::regclass
  ) then
    create trigger tg_estoque_saldos_depositos_set_updated_at
      before update on public.estoque_saldos_depositos
      for each row execute function public.tg_set_updated_at();
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 4) Kardex por depósito (compat)
-- -----------------------------------------------------------------------------
alter table public.estoque_movimentos
  add column if not exists deposito_id uuid null references public.estoque_depositos(id) on delete set null;

create index if not exists idx_estoque_movimentos_emp_prod_dep_created
  on public.estoque_movimentos (empresa_id, produto_id, deposito_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 5) Helpers: default depósito + acesso
-- -----------------------------------------------------------------------------
drop function if exists public.suprimentos_default_deposito_ensure();
create or replace function public.suprimentos_default_deposito_ensure()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_id uuid;
begin
  if v_emp is null then
    raise exception '[SUP][DEP] empresa_id inválido' using errcode='42501';
  end if;

  select d.id into v_id
  from public.estoque_depositos d
  where d.empresa_id = v_emp and d.is_default = true and d.ativo = true
  order by d.created_at asc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.estoque_depositos (empresa_id, nome, codigo, ativo, is_default)
  values (v_emp, 'Principal', 'PRINCIPAL', true, true)
  on conflict do nothing;

  select d.id into v_id
  from public.estoque_depositos d
  where d.empresa_id = v_emp and d.ativo = true
  order by d.is_default desc, d.created_at asc
  limit 1;

  -- garante único default
  update public.estoque_depositos
  set is_default = (id = v_id)
  where empresa_id = v_emp;

  return v_id;
end;
$$;

revoke all on function public.suprimentos_default_deposito_ensure() from public, anon;
grant execute on function public.suprimentos_default_deposito_ensure() to authenticated, service_role;

drop function if exists public.suprimentos_deposito_can_view(uuid);
create or replace function public.suprimentos_deposito_can_view(p_deposito_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_has_rules boolean := false;
  v_ok boolean := false;
begin
  if v_emp is null then
    return false;
  end if;

  select exists(select 1 from public.estoque_deposito_usuarios u where u.empresa_id = v_emp limit 1)
    into v_has_rules;

  if not coalesce(v_has_rules, false) then
    return true;
  end if;

  select exists(
    select 1
    from public.estoque_deposito_usuarios u
    where u.empresa_id = v_emp
      and u.deposito_id = p_deposito_id
      and u.user_id = auth.uid()
      and u.can_view = true
  ) into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.suprimentos_deposito_can_view(uuid) from public, anon;
grant execute on function public.suprimentos_deposito_can_view(uuid) to authenticated, service_role;

drop function if exists public.suprimentos_deposito_can_move(uuid);
create or replace function public.suprimentos_deposito_can_move(p_deposito_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_has_rules boolean := false;
  v_ok boolean := false;
begin
  if v_emp is null then
    return false;
  end if;

  select exists(select 1 from public.estoque_deposito_usuarios u where u.empresa_id = v_emp limit 1)
    into v_has_rules;

  if not coalesce(v_has_rules, false) then
    return true;
  end if;

  select exists(
    select 1
    from public.estoque_deposito_usuarios u
    where u.empresa_id = v_emp
      and u.deposito_id = p_deposito_id
      and u.user_id = auth.uid()
      and u.can_move = true
  ) into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.suprimentos_deposito_can_move(uuid) from public, anon;
grant execute on function public.suprimentos_deposito_can_move(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6) RPCs V2
-- -----------------------------------------------------------------------------
drop function if exists public.suprimentos_depositos_list(boolean);
create or replace function public.suprimentos_depositos_list(p_only_active boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_default uuid;
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('estoque','view');

  v_default := public.suprimentos_default_deposito_ensure();

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.is_default desc, x.nome asc)
    from (
      select
        d.id,
        d.nome,
        d.codigo,
        d.ativo,
        d.is_default,
        (case when public.suprimentos_deposito_can_view(d.id) then true else false end) as can_view,
        (case when public.suprimentos_deposito_can_move(d.id) then true else false end) as can_move
      from public.estoque_depositos d
      where d.empresa_id = v_emp
        and (not coalesce(p_only_active, true) or d.ativo = true)
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.suprimentos_depositos_list(boolean) from public, anon;
grant execute on function public.suprimentos_depositos_list(boolean) to authenticated, service_role;

drop function if exists public.suprimentos_list_posicao_estoque_v2(text, boolean, uuid);
create or replace function public.suprimentos_list_posicao_estoque_v2(
  p_search text default null,
  p_baixo_estoque boolean default false,
  p_deposito_id uuid default null
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
  v_dep uuid := coalesce(p_deposito_id, public.suprimentos_default_deposito_ensure());
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('estoque','view');

  if not public.suprimentos_deposito_can_view(v_dep) then
    raise exception '[SUP][DEP] sem acesso ao depósito' using errcode='42501';
  end if;

  return query
  select
    p.id as produto_id,
    p.nome,
    p.sku,
    coalesce(p.unidade, 'un') as unidade,
    coalesce(sd.saldo, 0) as saldo,
    coalesce(sd.custo_medio, 0) as custo_medio,
    p.estoque_minimo as estoque_min,
    case
      when coalesce(sd.saldo,0) <= 0 then 'zerado'
      when p.estoque_minimo is not null and coalesce(sd.saldo,0) <= p.estoque_minimo then 'baixo'
      else 'ok'
    end as status_estoque
  from public.produtos p
  left join public.estoque_saldos_depositos sd
    on sd.empresa_id = v_emp and sd.produto_id = p.id and sd.deposito_id = v_dep
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
      or coalesce(sd.saldo,0) <= coalesce(nullif(p.estoque_minimo, 0), 0)
    )
  order by p.nome asc;
end;
$$;

revoke all on function public.suprimentos_list_posicao_estoque_v2(text, boolean, uuid) from public, anon;
grant execute on function public.suprimentos_list_posicao_estoque_v2(text, boolean, uuid) to authenticated, service_role;

drop function if exists public.suprimentos_get_kardex_v2(uuid, uuid, integer);
create or replace function public.suprimentos_get_kardex_v2(
  p_produto_id uuid,
  p_deposito_id uuid default null,
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
  usuario_email text,
  deposito_id uuid,
  deposito_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_dep uuid := coalesce(p_deposito_id, public.suprimentos_default_deposito_ensure());
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('estoque','view');

  if not public.suprimentos_deposito_can_view(v_dep) then
    raise exception '[SUP][DEP] sem acesso ao depósito' using errcode='42501';
  end if;

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
    null::text as usuario_email,
    m.deposito_id,
    d.nome as deposito_nome
  from public.estoque_movimentos m
  left join public.estoque_depositos d
    on d.id = m.deposito_id and d.empresa_id = v_emp
  where m.empresa_id = v_emp
    and m.produto_id = p_produto_id
    and coalesce(m.deposito_id, v_dep) = v_dep
  order by m.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
end;
$$;

revoke all on function public.suprimentos_get_kardex_v2(uuid, uuid, integer) from public, anon;
grant execute on function public.suprimentos_get_kardex_v2(uuid, uuid, integer) to authenticated, service_role;

drop function if exists public.suprimentos_registrar_movimento_v2(uuid, uuid, text, numeric, numeric, text, text);
create or replace function public.suprimentos_registrar_movimento_v2(
  p_produto_id uuid,
  p_deposito_id uuid,
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
  v_dep uuid := coalesce(p_deposito_id, public.suprimentos_default_deposito_ensure());
  v_saldo_anterior numeric := 0;
  v_saldo_novo numeric := 0;
  v_fator int := 1;
  v_mov_id uuid;
  v_lote text := 'SEM_LOTE';
  v_custo_ant numeric := 0;
  v_custo_novo numeric := 0;
  v_total numeric := 0;
  v_total_custo numeric := 0;
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('estoque','update');

  if not public.suprimentos_deposito_can_move(v_dep) then
    raise exception '[SUP][DEP] sem permissão para movimentar no depósito' using errcode='42501';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade deve ser maior que zero.';
  end if;

  if p_tipo in ('saida', 'ajuste_saida', 'perda') then
    v_fator := -1;
  end if;

  -- lock por (empresa, produto, deposito)
  perform pg_advisory_xact_lock(
    ('x'||substr(replace(v_emp::text,'-',''),1,16))::bit(64)::bigint,
    ('x'||substr(replace(v_dep::text,'-',''),1,16))::bit(64)::bigint
  );

  select saldo, custo_medio
    into v_saldo_anterior, v_custo_ant
  from public.estoque_saldos_depositos
  where empresa_id = v_emp and produto_id = p_produto_id and deposito_id = v_dep
  for update;

  if not found then
    insert into public.estoque_saldos_depositos (empresa_id, produto_id, deposito_id, saldo, custo_medio)
    values (v_emp, p_produto_id, v_dep, 0, 0)
    on conflict (empresa_id, produto_id, deposito_id) do nothing;
    v_saldo_anterior := 0;
    v_custo_ant := 0;
  end if;

  v_saldo_novo := v_saldo_anterior + (p_quantidade * v_fator);

  if p_tipo in ('entrada','ajuste_entrada') and p_custo_unitario is not null and v_saldo_novo > 0 then
    v_custo_novo := ((v_saldo_anterior * v_custo_ant) + (p_quantidade * p_custo_unitario)) / v_saldo_novo;
  else
    v_custo_novo := v_custo_ant;
  end if;

  update public.estoque_saldos_depositos
  set saldo = v_saldo_novo, custo_medio = v_custo_novo, updated_at = now()
  where empresa_id = v_emp and produto_id = p_produto_id and deposito_id = v_dep;

  -- atualiza o saldo total (soma dos depósitos)
  select coalesce(sum(saldo),0), coalesce(sum(saldo * custo_medio),0)
    into v_total, v_total_custo
  from public.estoque_saldos_depositos
  where empresa_id = v_emp and produto_id = p_produto_id;

  insert into public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
  values (v_emp, p_produto_id, v_total, case when v_total <= 0 then 0 else (v_total_custo / v_total) end)
  on conflict (empresa_id, produto_id) do update
    set saldo = excluded.saldo,
        custo_medio = excluded.custo_medio,
        updated_at = now();

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
    deposito_id,
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
    v_dep,
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

revoke all on function public.suprimentos_registrar_movimento_v2(uuid, uuid, text, numeric, numeric, text, text) from public, anon;
grant execute on function public.suprimentos_registrar_movimento_v2(uuid, uuid, text, numeric, numeric, text, text) to authenticated, service_role;

drop function if exists public.suprimentos_transferir_estoque(uuid, uuid, uuid, numeric, text, text);
create or replace function public.suprimentos_transferir_estoque(
  p_produto_id uuid,
  p_deposito_from uuid,
  p_deposito_to uuid,
  p_quantidade numeric,
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
  v_from uuid := coalesce(p_deposito_from, public.suprimentos_default_deposito_ensure());
  v_to uuid := coalesce(p_deposito_to, public.suprimentos_default_deposito_ensure());
  v_ref text := coalesce(nullif(btrim(p_documento_ref), ''), 'TRANSFER');
  v_obs text := nullif(btrim(p_observacao), '');
  v_out jsonb;
  v_in jsonb;
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('estoque','update');

  if v_from = v_to then
    raise exception 'Depósitos devem ser diferentes.' using errcode='23514';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade deve ser maior que zero.' using errcode='23514';
  end if;

  if not public.suprimentos_deposito_can_move(v_from) or not public.suprimentos_deposito_can_move(v_to) then
    raise exception '[SUP][DEP] sem permissão para transferir' using errcode='42501';
  end if;

  -- duas movimentações atômicas
  v_out := public.suprimentos_registrar_movimento_v2(p_produto_id, v_from, 'transfer_out', p_quantidade, null, v_ref, v_obs);
  v_in := public.suprimentos_registrar_movimento_v2(p_produto_id, v_to, 'transfer_in', p_quantidade, null, v_ref, v_obs);

  return jsonb_build_object('out', v_out, 'in', v_in);
end;
$$;

revoke all on function public.suprimentos_transferir_estoque(uuid, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.suprimentos_transferir_estoque(uuid, uuid, uuid, numeric, text, text) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

