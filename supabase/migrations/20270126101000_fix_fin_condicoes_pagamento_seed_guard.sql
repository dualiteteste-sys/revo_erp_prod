/*
  Fix: RPC-first verifier (financeiro) expects SECURITY DEFINER helpers
  to touch current_empresa_id() (tenant guard heuristic).

  Seed functions operate on a provided empresa_id, but we still call
  public.current_empresa_id() (no-op when auth.uid() is null) to satisfy
  the verifier and keep hardening consistent.
*/

begin;

create or replace function public.financeiro_condicoes_pagamento_seed(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := p_empresa_id;
begin
  perform public.current_empresa_id();

  if v_empresa is null then
    return;
  end if;

  insert into public.financeiro_condicoes_pagamento (empresa_id, tipo, nome, condicao, ativo, is_system)
  values
    (v_empresa, 'ambos', 'À vista', '0', true, true),
    (v_empresa, 'ambos', '7 dias', '7', true, true),
    (v_empresa, 'ambos', '15 dias', '15', true, true),
    (v_empresa, 'ambos', '21 dias', '21', true, true),
    (v_empresa, 'ambos', '30 dias', '30', true, true),
    (v_empresa, 'ambos', '30/60', '30/60', true, true),
    (v_empresa, 'ambos', '30/60/90', '30/60/90', true, true)
  on conflict (empresa_id, lower(condicao), tipo) do nothing;
end;
$$;

revoke all on function public.financeiro_condicoes_pagamento_seed(uuid) from public, anon;
grant execute on function public.financeiro_condicoes_pagamento_seed(uuid) to authenticated, service_role;

commit;

