/*
  Financeiro: garantir apenas 1 conta padrão por empresa

  Regras:
  - Apenas uma conta pode ser padrão para pagamentos por empresa
  - Apenas uma conta pode ser padrão para recebimentos por empresa

  Nota:
  - A RPC financeiro_contas_correntes_upsert já "desmarca" as demais quando marca uma como padrão.
  - Aqui adicionamos índices únicos parciais para evitar burlas via SQL e limpamos duplicidades antigas.
*/

begin;

-- Deduplica padrões existentes (mantém a mais recente; desmarca o restante).
do $$
begin
  if to_regclass('public.financeiro_contas_correntes') is null then
    return;
  end if;

  -- Pagamentos
  with ranked as (
    select
      id,
      empresa_id,
      row_number() over (
        partition by empresa_id
        order by updated_at desc nulls last, created_at desc nulls last
      ) as rn
    from public.financeiro_contas_correntes
    where padrao_para_pagamentos = true
  )
  update public.financeiro_contas_correntes cc
  set padrao_para_pagamentos = false
  from ranked r
  where cc.id = r.id
    and r.rn > 1;

  -- Recebimentos
  with ranked as (
    select
      id,
      empresa_id,
      row_number() over (
        partition by empresa_id
        order by updated_at desc nulls last, created_at desc nulls last
      ) as rn
    from public.financeiro_contas_correntes
    where padrao_para_recebimentos = true
  )
  update public.financeiro_contas_correntes cc
  set padrao_para_recebimentos = false
  from ranked r
  where cc.id = r.id
    and r.rn > 1;
end;
$$;

create unique index if not exists uq_fin_cc_padrao_pagamentos
  on public.financeiro_contas_correntes (empresa_id)
  where padrao_para_pagamentos = true;

create unique index if not exists uq_fin_cc_padrao_recebimentos
  on public.financeiro_contas_correntes (empresa_id)
  where padrao_para_recebimentos = true;

commit;

