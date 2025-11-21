/*
          # [Operation Name]
          Criação do Módulo de Contas a Receber

          ## Query Description: "Este script cria a estrutura completa para o módulo de Contas a Receber, incluindo a tabela principal `contas_a_receber`, políticas de segurança RLS para isolamento de dados por empresa, e todas as funções RPC necessárias para a interface (listar, buscar, salvar, deletar e sumarizar). A operação é segura e não afeta dados existentes."
          
          ## Metadata:
          - Schema-Category: "Structural"
          - Impact-Level: "Low"
          - Requires-Backup: false
          - Reversible: true
          
          ## Structure Details:
          - Tabela criada: public.contas_a_receber
          - Políticas RLS criadas para: SELECT, INSERT, UPDATE, DELETE em public.contas_a_receber
          - Funções RPC criadas: list_contas_a_receber, count_contas_a_receber, get_conta_a_receber_details, create_update_conta_a_receber, delete_conta_a_receber, get_contas_a_receber_summary
          
          ## Security Implications:
          - RLS Status: Enabled
          - Policy Changes: Yes (novas políticas para a tabela criada)
          - Auth Requirements: authenticated
          
          ## Performance Impact:
          - Indexes: Adicionados em `empresa_id`, `cliente_id`, e `status`.
          - Triggers: Adicionado trigger `handle_updated_at` para `contas_a_receber`.
          - Estimated Impact: Nenhum impacto em performance para operações existentes.
          */

-- 1. Enum para o status da conta
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_conta_receber') then
    create type public.status_conta_receber as enum ('pendente', 'pago', 'vencido', 'cancelado');
  end if;
end$$;

-- 2. Tabela de Contas a Receber
create table if not exists public.contas_a_receber (
    id uuid primary key default gen_random_uuid(),
    empresa_id uuid not null references public.empresas(id) on delete cascade,
    cliente_id uuid references public.pessoas(id) on delete set null,
    descricao text not null,
    valor numeric(15, 2) not null default 0,
    data_vencimento date not null,
    status public.status_conta_receber not null default 'pendente',
    data_pagamento date,
    valor_pago numeric(15, 2),
    observacoes text,
    
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Trigger de updated_at
drop trigger if exists on_contas_a_receber_updated on public.contas_a_receber;
create trigger on_contas_a_receber_updated
  before update on public.contas_a_receber
  for each row execute procedure public.tg_set_updated_at();

-- 4. Índices
create index if not exists idx_contas_a_receber_empresa_id on public.contas_a_receber(empresa_id);
create index if not exists idx_contas_a_receber_cliente_id on public.contas_a_receber(cliente_id);
create index if not exists idx_contas_a_receber_status on public.contas_a_receber(status);

-- 5. RLS
alter table public.contas_a_receber enable row level security;

drop policy if exists contas_a_receber_select_policy on public.contas_a_receber;
create policy contas_a_receber_select_policy on public.contas_a_receber for select
  to authenticated using (empresa_id = public.current_empresa_id());

drop policy if exists contas_a_receber_insert_policy on public.contas_a_receber;
create policy contas_a_receber_insert_policy on public.contas_a_receber for insert
  to authenticated with check (empresa_id = public.current_empresa_id());

drop policy if exists contas_a_receber_update_policy on public.contas_a_receber;
create policy contas_a_receber_update_policy on public.contas_a_receber for update
  to authenticated using (empresa_id = public.current_empresa_id()) with check (empresa_id = public.current_empresa_id());

drop policy if exists contas_a_receber_delete_policy on public.contas_a_receber;
create policy contas_a_receber_delete_policy on public.contas_a_receber for delete
  to authenticated using (empresa_id = public.current_empresa_id());

-- 6. Funções RPC

-- RPC para contagem
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
        c.descricao ilike '%' || p_q || '%' or
        p.nome ilike '%' || p_q || '%'
      ))
  );
end;
$$;
grant execute on function public.count_contas_a_receber to authenticated;

-- RPC para listagem
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
        c.descricao ilike '%' || p_q || '%' or
        p.nome ilike '%' || p_q || '%'
      ))
    order by
      case when p_order_by = 'descricao' and p_order_dir = 'asc' then c.descricao end asc,
      case when p_order_by = 'descricao' and p_order_dir = 'desc' then c.descricao end desc,
      case when p_order_by = 'cliente_nome' and p_order_dir = 'asc' then p.nome end asc,
      case when p_order_by = 'cliente_nome' and p_order_dir = 'desc' then p.nome end desc,
      case when p_order_by = 'data_vencimento' and p_order_dir = 'asc' then c.data_vencimento end asc,
      case when p_order_by = 'data_vencimento' and p_order_dir = 'desc' then c.data_vencimento end desc,
      case when p_order_by = 'valor' and p_order_dir = 'asc' then c.valor end asc,
      case when p_order_by = 'valor' and p_order_dir = 'desc' then c.valor end desc,
      case when p_order_by = 'status' and p_order_dir = 'asc' then c.status end asc,
      case when p_order_by = 'status' and p_order_dir = 'desc' then c.status end desc,
      c.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
grant execute on function public.list_contas_a_receber to authenticated;

-- RPC para buscar detalhes
create or replace function public.get_conta_a_receber_details(p_id uuid)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  rec public.contas_a_receber;
begin
  select * into rec
  from public.contas_a_receber
  where id = p_id and empresa_id = public.current_empresa_id();
  return rec;
end;
$$;
grant execute on function public.get_conta_a_receber_details to authenticated;

-- RPC para criar/atualizar
create or replace function public.create_update_conta_a_receber(p_payload jsonb)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := p_payload->>'id';
  rec public.contas_a_receber;
begin
  if v_id is null then
    -- Create
    insert into public.contas_a_receber (empresa_id, cliente_id, descricao, valor, data_vencimento, status, data_pagamento, valor_pago, observacoes)
    values (
      public.current_empresa_id(),
      (p_payload->>'cliente_id')::uuid,
      p_payload->>'descricao',
      (p_payload->>'valor')::numeric,
      (p_payload->>'data_vencimento')::date,
      (p_payload->>'status')::public.status_conta_receber,
      (p_payload->>'data_pagamento')::date,
      (p_payload->>'valor_pago')::numeric,
      p_payload->>'observacoes'
    ) returning * into rec;
  else
    -- Update
    update public.contas_a_receber set
      cliente_id = (p_payload->>'cliente_id')::uuid,
      descricao = p_payload->>'descricao',
      valor = (p_payload->>'valor')::numeric,
      data_vencimento = (p_payload->>'data_vencimento')::date,
      status = (p_payload->>'status')::public.status_conta_receber,
      data_pagamento = (p_payload->>'data_pagamento')::date,
      valor_pago = (p_payload->>'valor_pago')::numeric,
      observacoes = p_payload->>'observacoes'
    where id = v_id and empresa_id = public.current_empresa_id()
    returning * into rec;
  end if;
  return rec;
end;
$$;
grant execute on function public.create_update_conta_a_receber to authenticated;

-- RPC para deletar
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
grant execute on function public.delete_conta_a_receber to authenticated;

-- RPC para resumo
create or replace function public.get_contas_a_receber_summary()
returns table (
  total_pendente numeric,
  total_pago_mes numeric,
  total_vencido numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
    select
      coalesce(sum(case when status = 'pendente' then valor else 0 end), 0) as total_pendente,
      coalesce(sum(case when status = 'pago' and date_trunc('month', data_pagamento) = date_trunc('month', current_date) then valor_pago else 0 end), 0) as total_pago_mes,
      coalesce(sum(case when status = 'vencido' then valor else 0 end), 0) as total_vencido
    from public.contas_a_receber
    where empresa_id = public.current_empresa_id();
end;
$$;
grant execute on function public.get_contas_a_receber_summary to authenticated;

select pg_notify('pgrst','reload schema');
