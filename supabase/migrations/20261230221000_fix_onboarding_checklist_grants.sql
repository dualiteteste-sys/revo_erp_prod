/*
  Onboarding checklist: allow authenticated users to read required setup tables.

  The UI queries these tables directly via PostgREST:
  - public.financeiro_contas_correntes (HEAD/GET)
  - public.centros_de_custo (HEAD)
*/

begin;

grant select on table public.financeiro_contas_correntes to authenticated;
grant select on table public.centros_de_custo to authenticated;

select pg_notify('pgrst','reload schema');

commit;

