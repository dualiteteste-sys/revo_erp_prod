/*
  FIN-DRE-01b (P0) Financeiro RPC-first — remover grants diretos em tabela nova do DRE

  Motivo
  - O domínio Financeiro é RPC-first.
  - O gate `verify_financeiro_rpc_first.sql` falha se existir qualquer grant direto para `authenticated`/`anon`
    em tabelas `financeiro_%`.
  - A tabela `public.financeiro_dre_mapeamentos` não deve ser acessada via PostgREST diretamente pelo app.
*/

begin;

revoke all on table public.financeiro_dre_mapeamentos from anon;
revoke all on table public.financeiro_dre_mapeamentos from authenticated;
revoke all on table public.financeiro_dre_mapeamentos from public;

-- Service role pode operar para rotinas/admin/ops sem depender de grants implícitos.
grant select, insert, update, delete on table public.financeiro_dre_mapeamentos to service_role;

commit;

