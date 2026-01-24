/*
  Financeiro (RPC-first gate)

  O CI valida que o domínio de Financeiro não tenha GRANTs diretos em tabelas
  (anon/authenticated), garantindo que o acesso seja feito via RPCs.

  A tabela `financeiro_condicoes_pagamento` não deve ser acessível diretamente
  por `anon`/`authenticated` (mesmo com RLS).
*/

begin;

revoke all privileges on table public.financeiro_condicoes_pagamento from public;
revoke all privileges on table public.financeiro_condicoes_pagamento from anon;
revoke all privileges on table public.financeiro_condicoes_pagamento from authenticated;

commit;

