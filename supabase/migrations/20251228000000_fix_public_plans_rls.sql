/*
# [RLS] Fix Public Plans Policy
Libera a leitura pública (anônima) da tabela de planos, corrigindo o erro de permissão na landing page.

## Query Description:
Esta operação ajusta a política de segurança da tabela de planos (plans) para permitir que visitantes não autenticados (role anon) possam visualizar os planos ativos. Isso é necessário para que a página de preços funcione corretamente para novos usuários. A operação é segura e não afeta dados existentes.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- Tabela afetada: public.plans (política de RLS)
- Função afetada: public.current_user_id (reforço de segurança)

## Security Implications:
- RLS Status: Habilitado
- Policy Changes: Sim, uma nova política de SELECT é criada para `anon` e `authenticated`.
- Auth Requirements: Permite leitura anônima dos planos ativos.

## Performance Impact:
- Indexes: Nenhum
- Triggers: Nenhum
- Estimated Impact: Negligenciável. A consulta da policy é extremamente simples.
*/

-- [LANDING][PUBLIC READ] liberar SELECT para tabela de planos na landing
-- Mantém RLS ativado, mas com policy simples (sem funções) para role anon.
-- Também reforça a função current_user_id() para evitar erros futuros.

-- 0) Ativar RLS na tabela (idempotente)
alter table if exists public.plans enable row level security;

-- 1) Remover policies antigas conflitantes (opcional/defensivo)
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='plans' and policyname='plans_public_read'
  ) then
    execute 'drop policy plans_public_read on public.plans';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='plans' and policyname='plans_public_read_active'
  ) then
    execute 'drop policy plans_public_read_active on public.plans';
  end if;
end$$;

-- 2) Policy mínima para landing (SOMENTE planos ativos):
create policy plans_public_read_active
  on public.plans
  for select
  to anon, authenticated
  using (active = true);

-- 3) (Opcional, mas recomendado) Harden em current_user_id()
--    SECURITY DEFINER + search_path fixo + GRANT para anon/authenticated
create or replace function public.current_user_id()
returns uuid
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
      nullif((current_setting('request.jwt.claims', true))::jsonb ->> 'sub', '')::uuid
    )::uuid;
$$;

revoke all on function public.current_user_id() from public;
grant execute on function public.current_user_id() to anon, authenticated, service_role;

-- 4) Reload do schema no PostgREST (efeito imediato na API)
select pg_notify('pgrst','reload schema');
