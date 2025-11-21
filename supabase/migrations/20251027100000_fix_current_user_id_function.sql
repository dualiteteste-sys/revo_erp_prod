/*
# [Fix] current_user_id(): ler sub de claim JSON quando claim.flat não estiver presente
Garante que chamadas RPC autenticadas sempre resolvam o user_id.

## Query Description: Esta operação atualiza a função `public.current_user_id` para garantir que o ID do usuário seja corretamente extraído do token JWT, mesmo em cenários onde o formato do claim varia. A função agora verifica `request.jwt.claim.sub` e também o campo `sub` dentro do JSON `request.jwt.claims`. Esta mudança é segura, não afeta dados existentes e corrige um bug de autenticação em chamadas RPC, aumentando a robustez do sistema.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- Function: `public.current_user_id()`

## Security Implications:
- RLS Status: Not applicable
- Policy Changes: No
- Auth Requirements: A função é usada para obter o ID do usuário autenticado.

## Performance Impact:
- Indexes: None
- Triggers: None
- Estimated Impact: Nenhum impacto negativo na performance. A adição do `coalesce` é marginal.
*/

create or replace function public.current_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif((current_setting('request.jwt.claims', true)::json ->> 'sub'), '')::uuid
  );
$$;

-- Permissões (idempotente)
revoke all on function public.current_user_id() from public;
grant execute on function public.current_user_id() to anon, authenticated, service_role;
