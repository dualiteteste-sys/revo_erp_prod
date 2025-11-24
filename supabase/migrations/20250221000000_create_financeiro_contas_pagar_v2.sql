/*
  # Financeiro - Contas a Pagar (backend idempotente)

  ## Query Description
  Substitui o backend de Contas a Pagar com tabela, RLS e RPCs completas
  (listagem paginada, contagem, detalhes, upsert e delete, mais resumo).

  ## Impact Summary
  - Segurança: RLS por operação; RPCs SECURITY DEFINER; search_path fixo; logs [RPC].
  - Compatibilidade: create/drop idempotentes; assinaturas estáveis com total_count.
  - Reversibilidade: objetos isolados; pode ser removido sem efeitos colaterais.
  - Performance: índices essenciais; filtros por status/período e busca textual.
*/

-- =============================================
-- 0) Limpeza segura de funções legadas
-- =============================================
drop function if exists public.financeiro_contas_pagar_count(text, text, date, date);
drop function if exists public.financeiro_contas_pagar_list(int, int, text, text, date, date);
drop function if exists public.financeiro_contas_pagar_get(uuid);
drop function if exists public.financeiro_contas_pagar_upsert(jsonb);
drop function if exists public.financeiro_contas_pagar_delete(uuid);
drop function if exists public.financeiro_contas_pagar_summary(date, date);

-- =============================================
-- 1) Tabela principal
-- =============================================
create table if not exists public.financeiro_contas_pagar (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null default public.current_empresa_id(),
  fornecedor_id      uuid,                                 -- ref. pessoas (opcional)
  documento_ref      text,                                 -- ex: NF, pedido, fatura do fornecedor
  descricao          text,
  data_emissao       date,
  data_vencimento    date not null,
  data_pagamento     date,
  valor_total        numeric(15,2) not null check (valor_total >= 0),
  valor_pago         numeric(15,2) not null default 0 check (valor_pago >= 0),
  multa              numeric(15,2) not null default 0 check (multa >= 0),
  juros              numeric(15,2) not null default 0 check (juros >= 0),
  desconto           numeric(15,2) not null default 0 check (desconto >= 0),

  forma_pagamento    text,                                 -- ex: boleto, pix, transf, cheque, cartao
  centro_custo       text,                                 -- texto simples p/ evitar FK frágil
  categoria          text,                                 -- ex: "Fornecedores", "Serviços", etc.
  status             text not null default 'aberta'
                     check (status in ('aberta','parcial','paga','cancelada')),
  observacoes        text,

  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),

  constraint financeiro_cp_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint financeiro_cp_fornecedor_fkey
    foreign key (fornecedor_id) references public.pessoas(id)
);

-- Índices
create index if not exists idx_fin_cp_empresa
  on public.financeiro_contas_pagar (empresa_id);

create index if not exists idx_fin_cp_empresa_status_venc
  on public.financeiro_contas_pagar (empresa_id, status, data_vencimento);

create index if not exists idx_fin_cp_empresa_fornecedor
  on public.financeiro_contas_pagar (empresa_id, fornecedor_id);

create index if not exists idx_fin_cp_empresa_busca
  on public.financeiro_contas_pagar (empresa_id, documento_ref, descricao);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_financeiro_contas_pagar'
      and tgrelid = 'public.financeiro_contas_pagar'::regclass
  ) then
    create trigger handle_updated_at_financeiro_contas_pagar
      before update on public.financeiro_contas_pagar
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =============================================
-- 2) RLS por operação
-- =============================================
alter table public.financeiro_contas_pagar enable row level security;

drop policy if exists "fin_cp_select" on public.financeiro_contas_pagar;
drop policy if exists "fin_cp_insert" on public.financeiro_contas_pagar;
drop policy if exists "fin_cp_update" on public.financeiro_contas_pagar;
drop policy if exists "fin_cp_delete" on public.financeiro_contas_pagar;

create policy "fin_cp_select"
  on public.financeiro_contas_pagar
  for select
  using (empresa_id = public.current_empresa_id());

create policy "fin_cp_insert"
  on public.financeiro_contas_pagar
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "fin_cp_update"
  on public.financeiro_contas_pagar
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "fin_cp_delete"
  on public.financeiro_contas_pagar
  for delete
  using (empresa_id = public.current_empresa_id());

-- =============================================
-- 3) RPCs
-- =============================================

-- 3.1) Count (para paginação sem custo extra na lista grande)
create or replace function public.financeiro_contas_pagar_count(
  p_q           text default null,
  p_status      text default null,    -- aberta|parcial|paga|cancelada
  p_start_date  date default null,    -- filtra por data_vencimento
  p_end_date    date default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_cnt     bigint;
begin
  select count(*)
    into v_cnt
  from public.financeiro_contas_pagar cp
  where cp.empresa_id = v_empresa
    and (p_status is null or cp.status = p_status)
    and (p_start_date is null or cp.data_vencimento >= p_start_date)
    and (p_end_date   is null or cp.data_vencimento <= p_end_date)
    and (
      p_q is null
      or cp.descricao ilike '%'||p_q||'%'
      or coalesce(cp.documento_ref,'') ilike '%'||p_q||'%'
    );

  return v_cnt;
end;
$$;

revoke all on function public.financeiro_contas_pagar_count from public;
grant execute on function public.financeiro_contas_pagar_count to authenticated, service_role;


-- 3.2) List (paginado com total_count via window)
create or replace function public.financeiro_contas_pagar_list(
  p_limit       int  default 50,
  p_offset      int  default 0,
  p_q           text default null,
  p_status      text default null,
  p_start_date  date default null,
  p_end_date    date default null
)
returns table (
  id               uuid,
  fornecedor_id    uuid,
  fornecedor_nome  text,
  documento_ref    text,
  descricao        text,
  data_emissao     date,
  data_vencimento  date,
  data_pagamento   date,
  valor_total      numeric,
  valor_pago       numeric,
  saldo            numeric,
  status           text,
  forma_pagamento  text,
  total_count      bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  return query
  select
    cp.id,
    cp.fornecedor_id,
    f.nome as fornecedor_nome,
    cp.documento_ref,
    cp.descricao,
    cp.data_emissao,
    cp.data_vencimento,
    cp.data_pagamento,
    cp.valor_total,
    cp.valor_pago,
    (cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago as saldo,
    cp.status,
    cp.forma_pagamento,
    count(*) over() as total_count
  from public.financeiro_contas_pagar cp
  left join public.pessoas f on f.id = cp.fornecedor_id
  where cp.empresa_id = v_empresa
    and (p_status is null or cp.status = p_status)
    and (p_start_date is null or cp.data_vencimento >= p_start_date)
    and (p_end_date   is null or cp.data_vencimento <= p_end_date)
    and (
      p_q is null
      or cp.descricao ilike '%'||p_q||'%'
      or coalesce(cp.documento_ref,'') ilike '%'||p_q||'%'
      or coalesce(f.nome,'') ilike '%'||p_q||'%'
    )
  order by
    (cp.status in ('aberta','parcial')) desc,    -- abertas primeiro
    cp.data_vencimento asc nulls last,
    cp.created_at asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.financeiro_contas_pagar_list from public;
grant execute on function public.financeiro_contas_pagar_list to authenticated, service_role;


-- 3.3) Get details (jsonb)
create or replace function public.financeiro_contas_pagar_get(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_res     jsonb;
begin
  select
    to_jsonb(cp.*)
    || jsonb_build_object(
         'fornecedor_nome', f.nome,
         'saldo', (cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago
       )
  into v_res
  from public.financeiro_contas_pagar cp
  left join public.pessoas f on f.id = cp.fornecedor_id
  where cp.id = p_id
    and cp.empresa_id = v_empresa;

  return v_res;
end;
$$;

revoke all on function public.financeiro_contas_pagar_get from public;
grant execute on function public.financeiro_contas_pagar_get to authenticated, service_role;


-- 3.4) Upsert (jsonb) — cria/atualiza título
create or replace function public.financeiro_contas_pagar_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid;
  v_status  text;
begin
  if (p_payload->>'data_vencimento')::date is null then
    raise exception 'data_vencimento é obrigatória.';
  end if;
  if (p_payload->>'valor_total')::numeric is null then
    raise exception 'valor_total é obrigatório.';
  end if;

  v_status := coalesce(p_payload->>'status', 'aberta');
  if v_status not in ('aberta','parcial','paga','cancelada') then
    raise exception 'status inválido.';
  end if;

  if p_payload->>'id' is not null then
    update public.financeiro_contas_pagar
    set
      fornecedor_id     = (p_payload->>'fornecedor_id')::uuid,
      documento_ref     = p_payload->>'documento_ref',
      descricao         = p_payload->>'descricao',
      data_emissao      = (p_payload->>'data_emissao')::date,
      data_vencimento   = (p_payload->>'data_vencimento')::date,
      data_pagamento    = (p_payload->>'data_pagamento')::date,
      valor_total       = (p_payload->>'valor_total')::numeric,
      valor_pago        = coalesce((p_payload->>'valor_pago')::numeric, valor_pago),
      multa             = coalesce((p_payload->>'multa')::numeric, multa),
      juros             = coalesce((p_payload->>'juros')::numeric, juros),
      desconto          = coalesce((p_payload->>'desconto')::numeric, desconto),
      forma_pagamento   = coalesce(p_payload->>'forma_pagamento', forma_pagamento),
      centro_custo      = coalesce(p_payload->>'centro_custo', centro_custo),
      categoria         = coalesce(p_payload->>'categoria', categoria),
      status            = v_status,
      observacoes       = p_payload->>'observacoes'
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa
    returning id into v_id;
  else
    insert into public.financeiro_contas_pagar (
      empresa_id, fornecedor_id, documento_ref, descricao,
      data_emissao, data_vencimento, data_pagamento,
      valor_total, valor_pago, multa, juros, desconto,
      forma_pagamento, centro_custo, categoria, status, observacoes
    ) values (
      v_empresa,
      (p_payload->>'fornecedor_id')::uuid,
      p_payload->>'documento_ref',
      p_payload->>'descricao',
      (p_payload->>'data_emissao')::date,
      (p_payload->>'data_vencimento')::date,
      (p_payload->>'data_pagamento')::date,
      (p_payload->>'valor_total')::numeric,
      coalesce((p_payload->>'valor_pago')::numeric, 0),
      coalesce((p_payload->>'multa')::numeric, 0),
      coalesce((p_payload->>'juros')::numeric, 0),
      coalesce((p_payload->>'desconto')::numeric, 0),
      p_payload->>'forma_pagamento',
      p_payload->>'centro_custo',
      p_payload->>'categoria',
      v_status,
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] financeiro_contas_pagar_upsert: '||v_id);

  return public.financeiro_contas_pagar_get(v_id);
end;
$$;

revoke all on function public.financeiro_contas_pagar_upsert from public;
grant execute on function public.financeiro_contas_pagar_upsert to authenticated, service_role;


-- 3.5) Delete (respeita RLS)
create or replace function public.financeiro_contas_pagar_delete(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  delete from public.financeiro_contas_pagar
  where id = p_id
    and empresa_id = v_empresa;

  perform pg_notify('app_log', '[RPC] financeiro_contas_pagar_delete: '||p_id);
end;
$$;

revoke all on function public.financeiro_contas_pagar_delete from public;
grant execute on function public.financeiro_contas_pagar_delete to authenticated, service_role;


-- 3.6) Summary (cards do dashboard/lista)
create or replace function public.financeiro_contas_pagar_summary(
  p_start_date date default null,
  p_end_date   date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_open    numeric;
  v_due     numeric;
  v_paid    numeric;
  v_partial numeric;
begin
  -- Filtro de período por data_vencimento
  select coalesce(sum((valor_total + multa + juros - desconto) - valor_pago),0)
    into v_open
  from public.financeiro_contas_pagar
  where empresa_id = v_empresa
    and status in ('aberta')
    and (p_start_date is null or data_vencimento >= p_start_date)
    and (p_end_date   is null or data_vencimento <= p_end_date);

  select coalesce(sum((valor_total + multa + juros - desconto) - valor_pago),0)
    into v_partial
  from public.financeiro_contas_pagar
  where empresa_id = v_empresa
    and status = 'parcial'
    and (p_start_date is null or data_vencimento >= p_start_date)
    and (p_end_date   is null or data_vencimento <= p_end_date);

  select coalesce(sum((valor_total + multa + juros - desconto)),0)
    into v_paid
  from public.financeiro_contas_pagar
  where empresa_id = v_empresa
    and status = 'paga'
    and (p_start_date is null or data_vencimento >= p_start_date)
    and (p_end_date   is null or data_vencimento <= p_end_date);

  -- vencidas (abertas/parciais com vencimento < hoje)
  select coalesce(sum((valor_total + multa + juros - desconto) - valor_pago),0)
    into v_due
  from public.financeiro_contas_pagar
  where empresa_id = v_empresa
    and status in ('aberta','parcial')
    and data_vencimento < current_date
    and (p_start_date is null or data_vencimento >= p_start_date)
    and (p_end_date   is null or data_vencimento <= p_end_date);

  return jsonb_build_object(
    'abertas',  v_open,
    'parciais', v_partial,
    'pagas',    v_paid,
    'vencidas', v_due
  );
end;
$$;

revoke all on function public.financeiro_contas_pagar_summary from public;
grant execute on function public.financeiro_contas_pagar_summary to authenticated, service_role;
