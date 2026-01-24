/*
  Segurança: seed é função interna (trigger/migration) e não deve ser exposta ao app.
  Isso também evita falhas no verificador "financeiro RPC-first" que checa hardening
  apenas para funções SECURITY DEFINER expostas a authenticated.
*/

begin;

revoke all on function public.financeiro_condicoes_pagamento_seed(uuid) from public, anon, authenticated;
grant execute on function public.financeiro_condicoes_pagamento_seed(uuid) to service_role;

commit;

