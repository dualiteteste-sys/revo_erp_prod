/*
  SUP-STA-02: Inventário cíclico (contagem -> divergência -> aprovação -> ajuste auditável)

  Implementação:
  - Tabelas:
    - public.estoque_inventarios (header)
    - public.estoque_inventario_itens (itens)
  - RPCs:
    - suprimentos_inventarios_list
    - suprimentos_inventario_create
    - suprimentos_inventario_get
    - suprimentos_inventario_set_count
    - suprimentos_inventario_aprovar (gera ajustes via suprimentos_registrar_movimento)
  - Auditoria:
    - Habilita audit_logs_trigger nas tabelas (quando audit_logs existir).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabelas
-- -----------------------------------------------------------------------------
create table if not exists public.estoque_inventarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  status text not null default 'em_contagem' check (status in ('rascunho','em_contagem','aprovado','cancelado')),
  created_by uuid null default auth.uid(),
  approved_by uuid null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_estoque_inventarios_empresa_status_created
  on public.estoque_inventarios (empresa_id, status, created_at desc);

create table if not exists public.estoque_inventario_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  inventario_id uuid not null references public.estoque_inventarios(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  saldo_sistema numeric(15,4) not null default 0,
  quantidade_contada numeric(15,4) null,
  divergencia numeric(15,4) not null default 0,
  status text not null default 'pendente' check (status in ('pendente','contado','ajustado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estoque_inventario_itens_uk unique (inventario_id, produto_id)
);

create index if not exists idx_estoque_inventario_itens_inv_prod
  on public.estoque_inventario_itens (inventario_id, produto_id);

create index if not exists idx_estoque_inventario_itens_empresa_status
  on public.estoque_inventario_itens (empresa_id, status, updated_at desc);

drop trigger if exists tg_estoque_inventarios_set_updated_at on public.estoque_inventarios;
create trigger tg_estoque_inventarios_set_updated_at
before update on public.estoque_inventarios
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_estoque_inventario_itens_set_updated_at on public.estoque_inventario_itens;
create trigger tg_estoque_inventario_itens_set_updated_at
before update on public.estoque_inventario_itens
for each row execute function public.tg_set_updated_at();

alter table public.estoque_inventarios enable row level security;
alter table public.estoque_inventario_itens enable row level security;

drop policy if exists sel_inv_by_empresa on public.estoque_inventarios;
create policy sel_inv_by_empresa
  on public.estoque_inventarios
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_inv_same_empresa on public.estoque_inventarios;
create policy ins_inv_same_empresa
  on public.estoque_inventarios
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists upd_inv_same_empresa on public.estoque_inventarios;
create policy upd_inv_same_empresa
  on public.estoque_inventarios
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_inv_same_empresa on public.estoque_inventarios;
create policy del_inv_same_empresa
  on public.estoque_inventarios
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists sel_inv_itens_by_empresa on public.estoque_inventario_itens;
create policy sel_inv_itens_by_empresa
  on public.estoque_inventario_itens
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_inv_itens_same_empresa on public.estoque_inventario_itens;
create policy ins_inv_itens_same_empresa
  on public.estoque_inventario_itens
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists upd_inv_itens_same_empresa on public.estoque_inventario_itens;
create policy upd_inv_itens_same_empresa
  on public.estoque_inventario_itens
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_inv_itens_same_empresa on public.estoque_inventario_itens;
create policy del_inv_itens_same_empresa
  on public.estoque_inventario_itens
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.estoque_inventarios to authenticated;
grant select, insert, update, delete on table public.estoque_inventario_itens to authenticated;

-- -----------------------------------------------------------------------------
-- 2) RPCs
-- -----------------------------------------------------------------------------
drop function if exists public.suprimentos_inventarios_list(text[], int, int);
create or replace function public.suprimentos_inventarios_list(
  p_status text[] default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  id uuid,
  nome text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  itens_total int,
  itens_contados int,
  divergencias int
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('suprimentos','view');

  return query
  with base as (
    select i.*
    from public.estoque_inventarios i
    where i.empresa_id = v_emp
      and (
        p_status is null
        or array_length(p_status, 1) is null
        or i.status = any(p_status)
      )
    order by i.created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  ),
  agg as (
    select
      it.inventario_id,
      count(*)::int as itens_total,
      count(*) filter (where it.quantidade_contada is not null)::int as itens_contados,
      count(*) filter (where it.divergencia <> 0)::int as divergencias
    from public.estoque_inventario_itens it
    join base b on b.id = it.inventario_id
    group by it.inventario_id
  )
  select
    b.id,
    b.nome,
    b.status,
    b.created_at,
    b.updated_at,
    coalesce(a.itens_total, 0),
    coalesce(a.itens_contados, 0),
    coalesce(a.divergencias, 0)
  from base b
  left join agg a on a.inventario_id = b.id
  order by b.created_at desc;
end;
$$;

revoke all on function public.suprimentos_inventarios_list(text[], int, int) from public, anon;
grant execute on function public.suprimentos_inventarios_list(text[], int, int) to authenticated, service_role;

drop function if exists public.suprimentos_inventario_create(text, uuid[]);
create or replace function public.suprimentos_inventario_create(
  p_nome text,
  p_produto_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_id uuid;
begin
  perform public.require_permission_for_current_user('suprimentos','update');

  if v_emp is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'nome é obrigatório' using errcode = 'P0001';
  end if;

  insert into public.estoque_inventarios (empresa_id, nome, status, created_by)
  values (v_emp, btrim(p_nome), 'em_contagem', auth.uid())
  returning id into v_id;

  insert into public.estoque_inventario_itens (empresa_id, inventario_id, produto_id, saldo_sistema, quantidade_contada, divergencia, status)
  select
    v_emp,
    v_id,
    p.id as produto_id,
    coalesce(s.saldo, 0) as saldo_sistema,
    null::numeric as quantidade_contada,
    0::numeric as divergencia,
    'pendente'::text as status
  from public.produtos p
  left join public.estoque_saldos s
    on s.empresa_id = v_emp and s.produto_id = p.id
  where p.empresa_id = v_emp
    and coalesce(p.controlar_estoque, true) = true
    and (
      p_produto_ids is null
      or array_length(p_produto_ids, 1) is null
      or p.id = any(p_produto_ids)
    );

  return v_id;
end;
$$;

revoke all on function public.suprimentos_inventario_create(text, uuid[]) from public, anon;
grant execute on function public.suprimentos_inventario_create(text, uuid[]) to authenticated, service_role;

drop function if exists public.suprimentos_inventario_get(uuid);
create or replace function public.suprimentos_inventario_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_header jsonb;
  v_items jsonb;
begin
  perform public.require_permission_for_current_user('suprimentos','view');

  select jsonb_build_object(
    'id', i.id,
    'nome', i.nome,
    'status', i.status,
    'created_at', i.created_at,
    'updated_at', i.updated_at,
    'approved_at', i.approved_at
  )
  into v_header
  from public.estoque_inventarios i
  where i.id = p_id and i.empresa_id = v_emp;

  if v_header is null then
    raise exception 'Inventário não encontrado' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', it.id,
    'produto_id', it.produto_id,
    'produto_nome', p.nome,
    'sku', p.sku,
    'unidade', coalesce(p.unidade, 'un'),
    'saldo_sistema', it.saldo_sistema,
    'quantidade_contada', it.quantidade_contada,
    'divergencia', it.divergencia,
    'status', it.status,
    'updated_at', it.updated_at
  ) order by p.nome asc), '[]'::jsonb)
  into v_items
  from public.estoque_inventario_itens it
  join public.produtos p on p.id = it.produto_id
  where it.inventario_id = p_id and it.empresa_id = v_emp;

  return jsonb_build_object('header', v_header, 'items', v_items);
end;
$$;

revoke all on function public.suprimentos_inventario_get(uuid) from public, anon;
grant execute on function public.suprimentos_inventario_get(uuid) to authenticated, service_role;

drop function if exists public.suprimentos_inventario_set_count(uuid, uuid, numeric);
create or replace function public.suprimentos_inventario_set_count(
  p_inventario_id uuid,
  p_produto_id uuid,
  p_quantidade_contada numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_status text;
begin
  perform public.require_permission_for_current_user('suprimentos','update');

  select i.status into v_status
  from public.estoque_inventarios i
  where i.id = p_inventario_id and i.empresa_id = v_emp;

  if v_status is null then
    raise exception 'Inventário não encontrado' using errcode = 'P0002';
  end if;

  if v_status <> 'em_contagem' then
    raise exception 'Inventário não está em contagem' using errcode = '42501';
  end if;

  update public.estoque_inventario_itens it
  set
    quantidade_contada = p_quantidade_contada,
    divergencia = coalesce(p_quantidade_contada, 0) - it.saldo_sistema,
    status = case when p_quantidade_contada is null then 'pendente' else 'contado' end,
    updated_at = now()
  where it.empresa_id = v_emp
    and it.inventario_id = p_inventario_id
    and it.produto_id = p_produto_id;

  if not found then
    raise exception 'Item não encontrado no inventário' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.suprimentos_inventario_set_count(uuid, uuid, numeric) from public, anon;
grant execute on function public.suprimentos_inventario_set_count(uuid, uuid, numeric) to authenticated, service_role;

drop function if exists public.suprimentos_inventario_aprovar(uuid);
create or replace function public.suprimentos_inventario_aprovar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_status text;
  v_prefix text := 'INV-' || left(p_id::text, 8);
  v_total int := 0;
  v_contados int := 0;
  v_ajustes int := 0;
  r record;
  v_diff numeric;
begin
  perform public.require_permission_for_current_user('suprimentos','update');

  select i.status into v_status
  from public.estoque_inventarios i
  where i.id = p_id and i.empresa_id = v_emp
  for update;

  if v_status is null then
    raise exception 'Inventário não encontrado' using errcode = 'P0002';
  end if;

  if v_status <> 'em_contagem' then
    raise exception 'Inventário não está em contagem' using errcode = '42501';
  end if;

  select count(*)::int, count(*) filter (where quantidade_contada is not null)::int
  into v_total, v_contados
  from public.estoque_inventario_itens
  where empresa_id = v_emp and inventario_id = p_id;

  for r in
    select produto_id, saldo_sistema, quantidade_contada
    from public.estoque_inventario_itens
    where empresa_id = v_emp and inventario_id = p_id
      and quantidade_contada is not null
  loop
    v_diff := coalesce(r.quantidade_contada, 0) - coalesce(r.saldo_sistema, 0);
    if v_diff = 0 then
      continue;
    end if;

    if v_diff > 0 then
      perform public.suprimentos_registrar_movimento(r.produto_id, 'ajuste_entrada', v_diff, null, v_prefix, 'Inventário cíclico (ajuste automático)');
    else
      perform public.suprimentos_registrar_movimento(r.produto_id, 'ajuste_saida', abs(v_diff), null, v_prefix, 'Inventário cíclico (ajuste automático)');
    end if;

    v_ajustes := v_ajustes + 1;
  end loop;

  update public.estoque_inventario_itens
  set status = case when quantidade_contada is null then status else 'ajustado' end,
      updated_at = now()
  where empresa_id = v_emp and inventario_id = p_id;

  update public.estoque_inventarios
  set status = 'aprovado',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where empresa_id = v_emp and id = p_id;

  return jsonb_build_object(
    'inventario_id', p_id,
    'itens_total', v_total,
    'itens_contados', v_contados,
    'ajustes', v_ajustes
  );
end;
$$;

revoke all on function public.suprimentos_inventario_aprovar(uuid) from public, anon;
grant execute on function public.suprimentos_inventario_aprovar(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Auditoria (quando disponível)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.audit_logs') is null or to_regprocedure('public.process_audit_log()') is null then
    return;
  end if;

  execute 'drop trigger if exists audit_logs_trigger on public.estoque_inventarios';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.estoque_inventarios for each row execute function public.process_audit_log()';

  execute 'drop trigger if exists audit_logs_trigger on public.estoque_inventario_itens';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.estoque_inventario_itens for each row execute function public.process_audit_log()';
end;
$$;

select pg_notify('pgrst','reload schema');

commit;

