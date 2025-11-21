/*
# Fix Public Plans RLS
This migration adjusts the Row Level Security (RLS) policy for the `public.plans` table to allow public read access, which is necessary for the landing page's pricing section. It also hardens the `current_user_id` function for better security.

## Query Description:
This operation modifies security policies. It removes any existing read policies on the 'plans' table and replaces them with a policy that allows public access only to active plans. It also updates a core function (`current_user_id`) to improve security. No data will be lost, but it's crucial for correctly displaying public pricing information.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- Table: `public.plans` (RLS policy)
- Function: `public.current_user_id()` (Definition and grants)

## Security Implications:
- RLS Status: Enabled (on `plans`)
- Policy Changes: Yes (replaces old policy with a new one for `SELECT`)
- Auth Requirements: None for reading plans, but hardens a function used by authenticated users.

## Performance Impact:
- Indexes: None
- Triggers: None
- Estimated Impact: Negligible. The new policy is simpler and may be slightly faster for anonymous users.
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

-- 2) Policy mínima para landing (SEM FUNÇÕES):
--    A) somente planos ativos:
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
