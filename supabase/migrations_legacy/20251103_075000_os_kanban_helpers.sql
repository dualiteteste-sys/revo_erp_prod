-- 20251103_075000_os_kanban_helpers.sql
-- RPCs de apoio para a Agenda Kanban de OS
-- Logs: [RPC][OS][KANBAN]

/*
  ## Descrição
  - Cria RPC `list_kanban_os` para buscar OS com status 'orcamento' ou 'aberta'.
  - Cria RPC `update_os_data_prevista` para reagendamento via drag-and-drop.
  - Ambas são multi-tenant e seguras.

  ## Segurança
  - Funções com `SECURITY DEFINER` e `set search_path`.
  - Validação de `current_empresa_id()`.
  - Grants mínimos para `authenticated`.

  ## Performance
  - `list_kanban_os` usa um JOIN simples e é otimizada para a UI.
  - `update_os_data_prevista` é um UPDATE simples por PK.
*/

-- 1) Listagem para o Kanban
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
    and os.status in ('orcamento', 'aberta');
end;
$$;

revoke all on function public.list_kanban_os() from public;
grant execute on function public.list_kanban_os() to authenticated;
grant execute on function public.list_kanban_os() to service_role;


-- 2) Atualização de data prevista
create or replace function public.update_os_data_prevista(
    p_os_id uuid,
    p_new_date date
)
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
    where id = p_os_id and empresa_id = v_emp;

    if not found then
        raise exception 'Ordem de Serviço não encontrada ou não pertence à empresa atual.' using errcode='P0002';
    end if;
end;
$$;

revoke all on function public.update_os_data_prevista(uuid, date) from public;
grant execute on function public.update_os_data_prevista(uuid, date) to authenticated;
grant execute on function public.update_os_data_prevista(uuid, date) to service_role;
