-- 20251103_080000_fix_kanban_list_type_final.sql
-- Fix: Recria a RPC list_kanban_os com numero BIGINT e enums com cast
-- Logs: [RPC][OS][KANBAN][FIX]

/*
  ## Query Description
  - Corrige a incompatibilidade de tipo na função `list_kanban_os`.
  - Altera a coluna de retorno `numero` de `integer` para `bigint`, alinhando com a tabela `ordem_servicos`.
  - Usa `DROP FUNCTION` antes de `CREATE` para garantir a alteração da assinatura de retorno.
  - Adiciona casts explícitos para o enum `status_os` no filtro.
  
  ## Segurança
  - Mantém `SECURITY DEFINER` e `search_path` fixo.
*/

-- 1) Drop requerido para mudar OUT params (RETURNS TABLE)
drop function if exists public.list_kanban_os();

-- 2) Recria a RPC com tipos corretos e segurança padrão do projeto
create function public.list_kanban_os()
returns table (
  id uuid,
  numero bigint,          -- alinha com public.ordem_servicos.numero
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
  left join public.pessoas p
         on p.id = os.cliente_id
        and p.empresa_id = os.empresa_id
  where os.empresa_id = v_emp
    and os.status in ('orcamento'::public.status_os, 'aberta'::public.status_os)
  order by os.data_prevista asc nulls last, os.numero asc;
end;
$$;

-- 3) Grants mínimos
revoke all on function public.list_kanban_os() from public;
grant execute on function public.list_kanban_os() to authenticated;
grant execute on function public.list_kanban_os() to service_role;

-- (Opcional) Índice de apoio para o Kanban
create index if not exists idx_os_emp_status_prevista
  on public.ordem_servicos (empresa_id, status, data_prevista);
