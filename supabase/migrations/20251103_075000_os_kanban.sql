-- 20251103_075000_os_kanban.sql
-- RPCs para a Agenda Kanban de Ordens de Serviço
-- Logs: [RPC][OS][KANBAN]

/*
  ## Descrição
  - Cria a RPC `list_kanban_os` para buscar OS com status 'orcamento' ou 'aberta'.
  - Cria a RPC `update_os_data_prevista` para reagendamento via drag-and-drop.
  - Ambas são SECURITY DEFINER, multi-tenant e seguras.

  ## Segurança
  - Funções com `set search_path = pg_catalog, public`.
  - Validação de `current_empresa_id()` em todas as operações.
  - Grants mínimos para `authenticated`.

  ## Performance
  - `list_kanban_os` usa um JOIN simples e é otimizada para buscar apenas os campos necessários.
  - `update_os_data_prevista` é uma operação de update simples e rápida.
*/

-- 1) RPC para listar OS para o Kanban
create or replace function public.list_kanban_os()
returns table (
  id uuid,
  numero int,
  descricao text,
  status public.status_os,
  data_prevista date,
  cliente_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then
    raise exception '[RPC][OS][KANBAN] empresa_id inválido' using errcode='42501';
  end if;

  return query
  select
    os.id,
    os.numero,
    os.descricao,
    os.status,
    os.data_prevista,
    p.nome as cliente_nome
  from public.ordem_servicos os
  left join public.pessoas p on os.cliente_id = p.id and os.empresa_id = p.empresa_id
  where os.empresa_id = v_emp
    and os.status in ('orcamento'::public.status_os, 'aberta'::public.status_os)
  order by os.data_prevista asc, os.numero asc;
end;
$$;

revoke all on function public.list_kanban_os() from public;
grant execute on function public.list_kanban_os() to authenticated;

-- 2) RPC para atualizar a data prevista da OS
create or replace function public.update_os_data_prevista(p_os_id uuid, p_new_date date)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then
    raise exception '[RPC][OS][KANBAN] empresa_id inválido' using errcode='42501';
  end if;

  update public.ordem_servicos
  set data_prevista = p_new_date,
      updated_at = now()
  where id = p_os_id
    and empresa_id = v_emp;

  if not found then
    raise exception 'Ordem de Serviço não encontrada ou não pertence à sua empresa.' using errcode='P0002';
  end if;

  perform pg_notify('app_log', '[RPC][OS][KANBAN] Data prevista da OS ' || p_os_id::text || ' atualizada para ' || coalesce(p_new_date::text, 'NULL'));
end;
$$;

revoke all on function public.update_os_data_prevista(uuid, date) from public;
grant execute on function public.update_os_data_prevista(uuid, date) to authenticated;
