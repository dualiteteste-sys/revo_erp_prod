/*
  FIN: RPC-first (piloto) — revogar grants diretos em `contas_a_receber`

  Motivo:
  - `contas_a_receber` é parte do domínio Financeiro e é multi-tenant.
  - Para reduzir risco de regressões e vazamentos, o app deve acessar via RPC (tenant-safe),
    não via PostgREST direto em tabela.
*/

begin;

revoke all on table public.contas_a_receber from anon, authenticated;

commit;

