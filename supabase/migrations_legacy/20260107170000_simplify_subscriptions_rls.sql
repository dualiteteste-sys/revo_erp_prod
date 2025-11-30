/*
  # Simplificação RLS Subscriptions
  - Remove dependência de current_empresa_id() para SELECT
  - Garante acesso de leitura baseado apenas em membership (empresa_usuarios)
  - Mantém restrição de escrita (INSERT/UPDATE/DELETE) no tenant ativo
  
  Segurança:
  - SELECT: auth.uid() -> empresa_usuarios -> subscriptions
  - WRITE: auth.uid() -> empresa_usuarios AND empresa_id = current_empresa_id()
*/

-- 0) Garantia: RLS habilitado
alter table public.subscriptions enable row level security;

-- 1) Limpeza das policies existentes para evitar sobreposição
drop policy if exists subs_write_by_owner_admin                 on public.subscriptions;
drop policy if exists subscriptions_select                      on public.subscriptions;
drop policy if exists subscriptions_select_member_authenticated on public.subscriptions;
drop policy if exists subs_select_by_membership                 on public.subscriptions;
drop policy if exists subscriptions_insert                      on public.subscriptions;
drop policy if exists subscriptions_update                      on public.subscriptions;
drop policy if exists subscriptions_delete                      on public.subscriptions;

-- 2) SELECT: apenas por membership (independente de current_empresa_id())
create policy subs_select_by_membership
  on public.subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = subscriptions.empresa_id
        and eu.user_id     = auth.uid()
    )
  );

-- 3) INSERT: membership + coerção de empresa_id no WITH CHECK
create policy subscriptions_insert
  on public.subscriptions
  for insert
  to authenticated
  with check (
    empresa_id = public.current_empresa_id()
    and exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = subscriptions.empresa_id
        and eu.user_id     = auth.uid()
    )
  );

-- 4) UPDATE: membership + coerência da empresa (USING e WITH CHECK)
create policy subscriptions_update
  on public.subscriptions
  for update
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = subscriptions.empresa_id
        and eu.user_id     = auth.uid()
    )
  )
  with check (
    empresa_id = public.current_empresa_id()
  );

-- 5) DELETE: membership + coerência da empresa
create policy subscriptions_delete
  on public.subscriptions
  for delete
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = subscriptions.empresa_id
        and eu.user_id     = auth.uid()
    )
  );
