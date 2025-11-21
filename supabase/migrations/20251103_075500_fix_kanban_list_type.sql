-- 20251103_075500_fix_kanban_list_type.sql
-- Fix: Corrige o tipo da coluna 'numero' na RPC list_kanban_os
-- Logs: [RPC][OS][KANBAN]

/*
  ## Query Description
  - Altera o tipo de retorno da coluna `numero` de `int` para `bigint` na função `list_kanban_os`.
  - Isso corrige o erro "structure of query does not match function result type" (42804), que ocorre porque a coluna `ordem_servicos.numero` é do tipo `bigint`, mas a função esperava `integer`.

  ## Segurança
  - Nenhuma alteração de segurança. Apenas correção de tipo.

  ## Performance
  - Neutro.

  ## Compatibilidade
  - A assinatura da função permanece a mesma em termos de nome e parâmetros. Apenas o tipo de um campo de retorno é ajustado para corresponder ao schema real.
*/

create or replace function public.list_kanban_os()
returns table (
  id uuid,
  numero bigint, -- Correção de int para bigint
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

-- Permissões são mantidas pelo CREATE OR REPLACE, mas é boa prática reaplicar.
revoke all on function public.list_kanban_os() from public;
grant execute on function public.list_kanban_os() to authenticated;
grant execute on function public.list_kanban_os() to service_role;
