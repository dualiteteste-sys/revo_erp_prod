/*
  Onboarding Wizard (per company)
  - Persists wizard dismiss/progress so the user can resume later.
*/

begin;

create table if not exists public.empresa_onboarding (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  steps jsonb not null default '{}'::jsonb,
  wizard_dismissed_at timestamptz,
  last_step_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_empresa_onboarding'
      and tgrelid = 'public.empresa_onboarding'::regclass
  ) then
    create trigger handle_updated_at_empresa_onboarding
      before update on public.empresa_onboarding
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.empresa_onboarding enable row level security;

drop policy if exists "empresa_onboarding_select" on public.empresa_onboarding;
drop policy if exists "empresa_onboarding_insert" on public.empresa_onboarding;
drop policy if exists "empresa_onboarding_update" on public.empresa_onboarding;

create policy "empresa_onboarding_select"
  on public.empresa_onboarding
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy "empresa_onboarding_insert"
  on public.empresa_onboarding
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy "empresa_onboarding_update"
  on public.empresa_onboarding
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

grant select, insert, update on table public.empresa_onboarding to authenticated;

select pg_notify('pgrst','reload schema');

commit;

