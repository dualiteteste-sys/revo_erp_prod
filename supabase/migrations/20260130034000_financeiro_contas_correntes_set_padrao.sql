/*
  Financeiro: definir conta corrente padrão sem sobrescrever outros campos

  Motivo:
  - Evitar perda de dados ao "marcar como padrão" a partir da listagem (UI envia somente o id).
  - Manter regra de apenas 1 padrão por empresa (pagamentos/recebimentos).
*/

begin;

create or replace function public.financeiro_contas_correntes_set_padrao(
  p_id uuid,
  p_para text, -- 'pagamentos' | 'recebimentos'
  p_value boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_exists boolean;
begin
  if v_empresa is null then
    raise exception '[FINANCEIRO][TESOURARIA] Nenhuma empresa ativa encontrada.' using errcode = '42501';
  end if;

  select exists(
    select 1
    from public.financeiro_contas_correntes cc
    where cc.id = p_id
      and cc.empresa_id = v_empresa
  ) into v_exists;

  if not v_exists then
    raise exception '[FINANCEIRO][TESOURARIA] Conta corrente não encontrada.' using errcode = 'P0002';
  end if;

  if lower(p_para) in ('pagamento','pagamentos') then
    update public.financeiro_contas_correntes
    set
      padrao_para_pagamentos = p_value,
      ativo = case when p_value then true else ativo end,
      updated_at = now()
    where empresa_id = v_empresa
      and id = p_id;

    if p_value then
      update public.financeiro_contas_correntes
      set padrao_para_pagamentos = false, updated_at = now()
      where empresa_id = v_empresa
        and id <> p_id;
    end if;
  elsif lower(p_para) in ('recebimento','recebimentos') then
    update public.financeiro_contas_correntes
    set
      padrao_para_recebimentos = p_value,
      ativo = case when p_value then true else ativo end,
      updated_at = now()
    where empresa_id = v_empresa
      and id = p_id;

    if p_value then
      update public.financeiro_contas_correntes
      set padrao_para_recebimentos = false, updated_at = now()
      where empresa_id = v_empresa
        and id <> p_id;
    end if;
  else
    raise exception '[FINANCEIRO][TESOURARIA] Parâmetro inválido: p_para deve ser pagamentos ou recebimentos.' using errcode = '22023';
  end if;

  perform pg_notify('app_log', '[RPC] financeiro_contas_correntes_set_padrao: ' || p_id || ' ' || p_para);
  return public.financeiro_contas_correntes_get(p_id);
end;
$$;

revoke all on function public.financeiro_contas_correntes_set_padrao(uuid, text, boolean) from public, anon;
grant execute on function public.financeiro_contas_correntes_set_padrao(uuid, text, boolean) to authenticated, service_role;

commit;

