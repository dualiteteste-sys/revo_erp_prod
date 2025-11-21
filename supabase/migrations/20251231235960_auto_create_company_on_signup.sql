/*
# [AUTOCREATE_COMPANY] Criação Automática de Empresa no Signup

Esta migração automatiza a criação de uma empresa padrão ("Empresa sem Nome") para novos usuários no momento em que confirmam o e-mail, agilizando o onboarding.

## Query Description:
- **Impacto nos Dados:** Nenhum dado existente é alterado. A mudança afeta apenas novos usuários a partir da aplicação desta migração.
- **Riscos:** Baixo. A função `bootstrap_empresa_for_current_user` já é idempotente. Se a criação falhar, o usuário ficará sem empresa, o que é o comportamento atual, mas agora o erro ocorrerá no backend, sendo mais fácil de rastrear.
- **Precauções:** Nenhuma. A operação é segura para ser aplicada em produção.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (basta executar `DROP TRIGGER on_auth_user_created ON auth.users;` e `DROP FUNCTION handle_new_user;`)

## Structure Details:
- **Tabelas Afetadas:** `auth.users` (adição de trigger).
- **Funções Criadas:** `public.handle_new_user()`.
- **Triggers Criados:** `on_auth_user_created` em `auth.users`.

## Security Implications:
- RLS Status: A função `handle_new_user` é `SECURITY DEFINER` para poder executar a RPC `bootstrap_empresa_for_current_user` com as permissões necessárias para inserir na tabela `empresas` e `empresa_usuarios`. Isso é seguro, pois a função é chamada apenas por um trigger do sistema (`auth.users`) e não aceita parâmetros externos.
- Policy Changes: No
- Auth Requirements: A função é acionada pelo sistema de autenticação do Supabase.

## Performance Impact:
- Indexes: Nenhum.
- Triggers: Adiciona um trigger `AFTER INSERT` em `auth.users`. O impacto é mínimo, pois a operação de insert nesta tabela é de baixa frequência.
- Estimated Impact: Desprezível para a performance geral do sistema.
*/

-- 1. Cria a função que será chamada pelo trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  -- Chama a RPC existente que cria uma empresa se o usuário não tiver uma.
  -- Passamos NULL para usar os valores padrão ("Empresa sem Nome").
  perform public.bootstrap_empresa_for_current_user('Empresa sem Nome', null);
  return new;
end;
$$;

-- 2. Concede permissão de execução para o service_role, necessário para o trigger
grant execute on function public.handle_new_user() to service_role;

-- 3. Remove qualquer trigger antigo para garantir idempotência
drop trigger if exists on_auth_user_created on auth.users;

-- 4. Cria o trigger em auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. Adiciona um comentário para clareza
comment on trigger on_auth_user_created on auth.users is 'Quando um novo usuário é criado no Supabase Auth, cria automaticamente uma empresa padrão para ele.';
