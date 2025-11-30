/*
# [Fix] provision_empresa_for_current_user(): remover coluna 'role' inexistente
Ajusta a função para alinhar com o schema da tabela `empresa_usuarios`, que não possui a coluna `role`, evitando erros durante a vinculação do usuário à nova empresa.

## Query Description: Esta operação substitui a função `provision_empresa_for_current_user` existente por uma versão corrigida. A mudança é segura e não afeta dados existentes, apenas corrige um erro de inserção na tabela `empresa_usuarios`.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (pode-se reverter para a versão anterior da função, se necessário)

## Structure Details:
- Function `public.provision_empresa_for_current_user` é modificada.
- Tabela `public.empresa_usuarios` é afetada no `INSERT` (sem `role`).

## Security Implications:
- RLS Status: Não alterado.
- Policy Changes: Não.
- Auth Requirements: A função continua a exigir um usuário autenticado (`authenticated` role).

## Performance Impact:
- Indexes: Nenhum.
- Triggers: Nenhum.
- Estimated Impact: Nenhum impacto de performance esperado.
*/

create or replace function public.provision_empresa_for_current_user(
  p_razao_social text,
  p_fantasia text,
  p_email text default null
)
returns public.empresas
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_emp public.empresas;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  insert into public.empresas (razao_social, fantasia, email)
  values (p_razao_social, p_fantasia, p_email)
  returning * into v_emp;

  -- Vincula o usuário como membro (sem coluna 'role')
  insert into public.empresa_usuarios (empresa_id, user_id)
  values (v_emp.id, v_user_id)
  on conflict do nothing;

  return v_emp;
end;
$$;

-- Permissões de execução (apenas clientes autenticados)
revoke all on function public.provision_empresa_for_current_user(text, text, text) from public;
grant execute on function public.provision_empresa_for_current_user(text, text, text) to authenticated;
