-- ===========================
-- 00) util: tg_set_updated_at
-- ===========================
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_set_updated_at'
  ) then
    create or replace function public.tg_set_updated_at()
    returns trigger
    language plpgsql
    security definer
    set search_path = pg_catalog, public
    as $fn$
    begin
      new.updated_at := now();
      return new;
    end;
    $fn$;
    revoke all on function public.tg_set_updated_at() from public;
    grant execute on function public.tg_set_updated_at() to authenticated, service_role;
  end if;
end$$;

-- ==========================================
-- 01) Enum de status (idempotente)
-- ==========================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_conta_receber') then
    create type public.status_conta_receber as enum ('pendente', 'pago', 'vencido', 'cancelado');
  end if;
end$$;

-- ==========================================
-- 02) Tabela principal (idempotente)
-- ==========================================
create table if not exists public.contas_a_receber (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.pessoas(id) on delete set null,
  descricao text not null,
  valor numeric(15,2) not null default 0,
  data_vencimento date not null,
  status public.status_conta_receber not null default 'pendente',
  data_pagamento date,
  valor_pago numeric(15,2),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================
-- 03) Trigger updated_at (idempotente)
-- ==========================================
drop trigger if exists on_contas_a_receber_updated on public.contas_a_receber;
create trigger on_contas_a_receber_updated
  before update on public.contas_a_receber
  for each row execute procedure public.tg_set_updated_at();

-- ==========================================
-- 04) Índices essenciais (idempotentes)
-- ==========================================
create index if not exists idx_contas_a_receber_empresa_id on public.contas_a_receber (empresa_id);
create index if not exists idx_contas_a_receber_cliente_id on public.contas_a_receber (cliente_id);
create index if not exists idx_contas_a_receber_status on public.contas_a_receber (status);

-- ==========================================
-- 05) RLS por operação (idempotente)
-- ==========================================
alter table public.contas_a_receber enable row level security;
alter table public.contas_a_receber force row level security;

drop policy if exists contas_a_receber_select_policy on public.contas_a_receber;
create policy contas_a_receber_select_policy on public.contas_a_receber
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists contas_a_receber_insert_policy on public.contas_a_receber;
create policy contas_a_receber_insert_policy on public.contas_a_receber
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists contas_a_receber_update_policy on public.contas_a_receber;
create policy contas_a_receber_update_policy on public.contas_a_receber
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists contas_a_receber_delete_policy on public.contas_a_receber;
create policy contas_a_receber_delete_policy on public.contas_a_receber
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

-- ==========================================
-- 06) RPCs seguras (SD + search_path + grants)
-- ==========================================

-- Contagem
create or replace function public.count_contas_a_receber(
  p_q text default null,
  p_status public.status_conta_receber default null
)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return (
    select count(*)
    from public.contas_a_receber c
    left join public.pessoas p on p.id = c.cliente_id
    where c.empresa_id = public.current_empresa_id()
      and (p_status is null or c.status = p_status)
      and (p_q is null or (
        c.descricao ilike '%'||p_q||'%' or
        p.nome ilike '%'||p_q||'%'
      ))
  );
end;
$$;
revoke all on function public.count_contas_a_receber(text, public.status_conta_receber) from public;
grant execute on function public.count_contas_a_receber(text, public.status_conta_receber) to authenticated;

-- Listagem
create or replace function public.list_contas_a_receber(
  p_limit int default 20,
  p_offset int default 0,
  p_q text default null,
  p_status public.status_conta_receber default null,
  p_order_by text default 'data_vencimento',
  p_order_dir text default 'asc'
)
returns table (
  id uuid,
  descricao text,
  cliente_nome text,
  data_vencimento date,
  valor numeric,
  status public.status_conta_receber
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select
    c.id,
    c.descricao,
    p.nome as cliente_nome,
    c.data_vencimento,
    c.valor,
    c.status
  from public.contas_a_receber c
  left join public.pessoas p on p.id = c.cliente_id
  where c.empresa_id = public.current_empresa_id()
    and (p_status is null or c.status = p_status)
    and (p_q is null or (
      c.descricao ilike '%'||p_q||'%' or
      p.nome ilike '%'||p_q||'%'
    ))
  order by
    case when p_order_by='descricao'        and p_order_dir='asc'  then c.descricao end asc,
    case when p_order_by='descricao'        and p_order_dir='desc' then c.descricao end desc,
    case when p_order_by='cliente_nome'     and p_order_dir='asc'  then p.nome end asc,
    case when p_order_by='cliente_nome'     and p_order_dir='desc' then p.nome end desc,
    case when p_order_by='data_vencimento'  and p_order_dir='asc'  then c.data_vencimento end asc,
    case when p_order_by='data_vencimento'  and p_order_dir='desc' then c.data_vencimento end desc,
    case when p_order_by='valor'            and p_order_dir='asc'  then c.valor end asc,
    case when p_order_by='valor'            and p_order_dir='desc' then c.valor end desc,
    case when p_order_by='status'           and p_order_dir='asc'  then c.status end asc,
    case when p_order_by='status'           and p_order_dir='desc' then c.status end desc,
    c.created_at desc
  limit greatest(p_limit,1)
  offset greatest(p_offset,0);
end;
$$;
revoke all on function public.list_contas_a_receber(int,int,text,public.status_conta_receber,text,text) from public;
grant execute on function public.list_contas_a_receber(int,int,text,public.status_conta_receber,text,text) to authenticated;

-- Detalhe
create or replace function public.get_conta_a_receber_details(p_id uuid)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare rec public.contas_a_receber;
begin
  select * into rec
  from public.contas_a_receber
  where id = p_id and empresa_id = public.current_empresa_id();
  return rec;
end;
$$;
revoke all on function public.get_conta_a_receber_details(uuid) from public;
grant execute on function public.get_conta_a_receber_details(uuid) to authenticated;

-- Create/Update
create or replace function public.create_update_conta_a_receber(p_payload jsonb)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  rec public.contas_a_receber;
begin
  if v_id is null then
    insert into public.contas_a_receber (
      empresa_id, cliente_id, descricao, valor, data_vencimento, status, data_pagamento, valor_pago, observacoes
    ) values (
      public.current_empresa_id(),
      nullif(p_payload->>'cliente_id','')::uuid,
      p_payload->>'descricao',
      nullif(p_payload->>'valor','')::numeric,
      nullif(p_payload->>'data_vencimento','')::date,
      coalesce(p_payload->>'status','pendente')::public.status_conta_receber,
      nullif(p_payload->>'data_pagamento','')::date,
      nullif(p_payload->>'valor_pago','')::numeric,
      p_payload->>'observacoes'
    )
    returning * into rec;
  else
    update public.contas_a_receber set
      cliente_id      = nullif(p_payload->>'cliente_id','')::uuid,
      descricao       = p_payload->>'descricao',
      valor           = nullif(p_payload->>'valor','')::numeric,
      data_vencimento = nullif(p_payload->>'data_vencimento','')::date,
      status          = coalesce(p_payload->>'status','pendente')::public.status_conta_receber,
      data_pagamento  = nullif(p_payload->>'data_pagamento','')::date,
      valor_pago      = nullif(p_payload->>'valor_pago','')::numeric,
      observacoes     = p_payload->>'observacoes'
    where id = v_id and empresa_id = public.current_empresa_id()
    returning * into rec;
  end if;

  return rec;
end;
$$;
revoke all on function public.create_update_conta_a_receber(jsonb) from public;
grant execute on function public.create_update_conta_a_receber(jsonb) to authenticated;

-- Delete
create or replace function public.delete_conta_a_receber(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.contas_a_receber
  where id = p_id and empresa_id = public.current_empresa_id();
end;
$$;
revoke all on function public.delete_conta_a_receber(uuid) from public;
grant execute on function public.delete_conta_a_receber(uuid) to authenticated;

-- Summary
CREATE OR REPLACE FUNCTION public.get_contas_a_receber_summary()
RETURNS TABLE(total_pendente numeric, total_pago_mes numeric, total_vencido numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS total_pendente,
    COALESCE(SUM(CASE WHEN status = 'pago' AND date_trunc('month', data_pagamento) = date_trunc('month', current_date) THEN valor_pago ELSE 0 END), 0) AS total_pago_mes,
    COALESCE(SUM(CASE WHEN status = 'vencido' THEN valor ELSE 0 END), 0) AS total_vencido
  FROM public.contas_a_receber
  WHERE empresa_id = public.current_empresa_id();
END;
$$;
REVOKE ALL ON FUNCTION public.get_contas_a_receber_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contas_a_receber_summary() TO authenticated;


-- PostgREST: recarregar schema
select pg_notify('pgrst','reload schema');
