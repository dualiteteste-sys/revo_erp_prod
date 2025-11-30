-- migration_name: 20251104213000_create_contas_a_pagar_module
-- logs: [DB][FINANCEIRO][PAGAR]
/*
  Resumo do Impacto
  - Segurança: Novas tabelas e RPCs seguem o padrão RLS e SECURITY DEFINER do projeto. O acesso é restrito ao tenant (empresa_id) do usuário logado.
  - Compatibilidade: Adiciona novas funcionalidades sem impactar as existentes.
  - Reversibilidade: Reversível via `DROP TABLE public.contas_a_pagar` e `DROP FUNCTION` para as RPCs.
  - Performance: Índices foram criados nos campos-chave (empresa_id, fornecedor_id, data_vencimento, status) para otimizar consultas.
*/
-- 1. Tipos Enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_conta_pagar') then
    create type public.status_conta_pagar as enum ('aberta', 'paga', 'vencida');
  end if;
end$$;
-- 2. Tabela `contas_a_pagar`
create table if not exists public.contas_a_pagar (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fornecedor_id uuid references public.pessoas(id) on delete set null,
  descricao text not null,
  valor numeric(15, 2) not null default 0,
  data_vencimento date not null,
  data_pagamento date null,
  status public.status_conta_pagar not null default 'aberta',
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.contas_a_pagar is 'Armazena as contas a pagar da empresa.';
-- 3. Índices
create index if not exists ix_contas_a_pagar_empresa_id on public.contas_a_pagar(empresa_id);
create index if not exists ix_contas_a_pagar_fornecedor_id on public.contas_a_pagar(fornecedor_id);
create index if not exists ix_contas_a_pagar_data_vencimento on public.contas_a_pagar(data_vencimento);
create index if not exists ix_contas_a_pagar_status on public.contas_a_pagar(status);
-- 4. Trigger de `updated_at`
drop trigger if exists tg_contas_a_pagar_updated_at on public.contas_a_pagar;
create trigger tg_contas_a_pagar_updated_at
before update on public.contas_a_pagar
for each row
execute function public.tg_set_updated_at();
-- 5. Políticas de RLS
alter table public.contas_a_pagar enable row level security;
alter table public.contas_a_pagar force row level security;
drop policy if exists select_contas_a_pagar on public.contas_a_pagar;
create policy select_contas_a_pagar on public.contas_a_pagar
  for select using (empresa_id = public.current_empresa_id());
drop policy if exists insert_contas_a_pagar on public.contas_a_pagar;
create policy insert_contas_a_pagar on public.contas_a_pagar
  for insert with check (empresa_id = public.current_empresa_id());
drop policy if exists update_contas_a_pagar on public.contas_a_pagar;
create policy update_contas_a_pagar on public.contas_a_pagar
  for update using (empresa_id = public.current_empresa_id());
drop policy if exists delete_contas_a_pagar on public.contas_a_pagar;
create policy delete_contas_a_pagar on public.contas_a_pagar
  for delete using (empresa_id = public.current_empresa_id());
-- 6. RPCs
-- RPC: create_update_conta_a_pagar
drop function if exists public.create_update_conta_a_pagar(jsonb);
create or replace function public.create_update_conta_a_pagar(
  p_payload jsonb
)
returns public.contas_a_pagar
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := p_payload->>'id';
  v_conta public.contas_a_pagar;
  v_empresa_id uuid := public.current_empresa_id();
  v_status public.status_conta_pagar;
begin
  if (p_payload->>'data_pagamento') is not null and p_payload->>'data_pagamento' <> 'null' then
    v_status := 'paga';
  elsif (p_payload->>'data_vencimento')::date < current_date then
    v_status := 'vencida';
  else
    v_status := 'aberta';
  end if;
  if v_id is null then
    -- Create
    insert into public.contas_a_pagar (
      empresa_id,
      fornecedor_id,
      descricao,
      valor,
      data_vencimento,
      data_pagamento,
      status,
      observacoes
    )
    values (
      v_empresa_id,
      (p_payload->>'fornecedor_id')::uuid,
      p_payload->>'descricao',
      (p_payload->>'valor')::numeric,
      (p_payload->>'data_vencimento')::date,
      (p_payload->>'data_pagamento')::date,
      v_status,
      p_payload->>'observacoes'
    )
    returning * into v_conta;
  else
    -- Update
    update public.contas_a_pagar
    set
      fornecedor_id = (p_payload->>'fornecedor_id')::uuid,
      descricao = p_payload->>'descricao',
      valor = (p_payload->>'valor')::numeric,
      data_vencimento = (p_payload->>'data_vencimento')::date,
      data_pagamento = (p_payload->>'data_pagamento')::date,
      status = v_status,
      observacoes = p_payload->>'observacoes'
    where id = v_id and empresa_id = v_empresa_id
    returning * into v_conta;
  end if;
  return v_conta;
end;
$$;
grant execute on function public.create_update_conta_a_pagar(jsonb) to authenticated;
-- RPC: list_contas_a_pagar
drop function if exists public.list_contas_a_pagar(integer, integer, text, text, text, date, date);
create or replace function public.list_contas_a_pagar(
  p_limit integer,
  p_offset integer,
  p_q text,
  p_status text,
  p_order text,
  p_start_date date,
  p_end_date date
)
returns table (
  id uuid,
  descricao text,
  valor numeric,
  data_vencimento date,
  status public.status_conta_pagar,
  fornecedor_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select
    cp.id,
    cp.descricao,
    cp.valor,
    cp.data_vencimento,
    cp.status,
    p.nome as fornecedor_nome
  from public.contas_a_pagar cp
  left join public.pessoas p on cp.fornecedor_id = p.id
  where
    cp.empresa_id = public.current_empresa_id()
    and (p_q is null or cp.descricao ilike '%' || p_q || '%' or p.nome ilike '%' || p_q || '%')
    and (p_status is null or cp.status = p_status::public.status_conta_pagar)
    and (p_start_date is null or cp.data_vencimento >= p_start_date)
    and (p_end_date is null or cp.data_vencimento <= p_end_date)
  order by
    case when p_order = 'data_vencimento asc' then cp.data_vencimento end asc,
    case when p_order = 'data_vencimento desc' then cp.data_vencimento end desc,
    case when p_order = 'valor asc' then cp.valor end asc,
    case when p_order = 'valor desc' then cp.valor end desc,
    case when p_order = 'fornecedor_nome asc' then p.nome end asc,
    case when p_order = 'fornecedor_nome desc' then p.nome end desc,
    cp.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;
grant execute on function public.list_contas_a_pagar(integer, integer, text, text, text, date, date) to authenticated;
-- RPC: count_contas_a_pagar
drop function if exists public.count_contas_a_pagar(text, text, date, date);
create or replace function public.count_contas_a_pagar(
  p_q text,
  p_status text,
  p_start_date date,
  p_end_date date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from public.contas_a_pagar cp
  left join public.pessoas p on cp.fornecedor_id = p.id
  where
    cp.empresa_id = public.current_empresa_id()
    and (p_q is null or cp.descricao ilike '%' || p_q || '%' or p.nome ilike '%' || p_q || '%')
    and (p_status is null or cp.status = p_status::public.status_conta_pagar)
    and (p_start_date is null or cp.data_vencimento >= p_start_date)
    and (p_end_date is null or cp.data_vencimento <= p_end_date);
  return v_count;
end;
$$;
grant execute on function public.count_contas_a_pagar(text, text, date, date) to authenticated;
-- RPC: delete_conta_a_pagar
drop function if exists public.delete_conta_a_pagar(uuid);
create or replace function public.delete_conta_a_pagar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.contas_a_pagar
  where id = p_id and empresa_id = public.current_empresa_id();
end;
$$;
grant execute on function public.delete_conta_a_pagar(uuid) to authenticated;
-- RPC: get_conta_a_pagar_details
drop function if exists public.get_conta_a_pagar_details(uuid);
create or replace function public.get_conta_a_pagar_details(p_id uuid)
returns public.contas_a_pagar
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_conta public.contas_a_pagar;
begin
  select *
  into v_conta
  from public.contas_a_pagar
  where id = p_id and empresa_id = public.current_empresa_id();
  return v_conta;
end;
$$;
grant execute on function public.get_conta_a_pagar_details(uuid) to authenticated;
