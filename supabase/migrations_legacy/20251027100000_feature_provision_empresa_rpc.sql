/*
# [Feature] Provisionar empresa do usuário atual (RPC)
Cria um registro em `public.empresas` e vincula o usuário autenticado em `public.empresa_usuarios` de forma atômica e segura. Esta função utiliza `SECURITY DEFINER` para garantir que a operação seja executada com os privilégios corretos, enquanto `public.current_user_id()` identifica o autor da chamada de forma segura.

## Query Description:
- **Impacto nos Dados:** Insere uma nova linha nas tabelas `empresas` e `empresa_usuarios`. Não afeta dados existentes.
- **Riscos:** Baixo. A função é projetada para ser segura, validando a autenticação do usuário antes de qualquer operação.
- **Precauções:** Nenhuma precaução especial é necessária.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (a função pode ser removida com `DROP FUNCTION`)

## Structure Details:
- **Função Criada:** `public.provision_empresa_for_current_user(text, text, text)`
- **Tabelas Afetadas:** `public.empresas` (INSERT), `public.empresa_usuarios` (INSERT)

## Security Implications:
- RLS Status: A função bypassa RLS devido ao `SECURITY DEFINER`, mas contém lógica interna para garantir que apenas usuários autenticados possam executá-la.
- Policy Changes: No
- Auth Requirements: Requer um JWT de usuário autenticado válido.

## Performance Impact:
- Indexes: Nenhum índice novo é adicionado.
- Triggers: Nenhum trigger novo é adicionado.
- Estimated Impact: Impacto de performance insignificante, limitado a inserções rápidas em duas tabelas.
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

  insert into public.empresa_usuarios (empresa_id, user_id, role)
  values (v_emp.id, v_user_id, 'owner')
  on conflict do nothing;

  return v_emp;
end;
$$;

revoke all on function public.provision_empresa_for_current_user(text, text, text) from public;
grant execute on function public.provision_empresa_for_current_user(text, text, text) to authenticated;
