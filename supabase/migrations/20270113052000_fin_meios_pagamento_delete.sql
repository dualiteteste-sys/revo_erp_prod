/*
  Financeiro: Meios de Pagamento/Recebimento — Delete seguro (somente se nunca usado)

  Contexto:
  - Hoje os módulos persistem o "meio" como texto (ex.: `forma_pagamento`, `forma_recebimento`).
  - Sem FK, então a validação de uso é feita por match case-insensitive do nome.

  Regras:
  - Não permite deletar `is_system=true`.
  - Só deleta se não existir nenhum uso em tabelas conhecidas do produto.
  - Multi-tenant via `current_empresa_id()`.
*/

begin;

drop function if exists public.financeiro_meios_pagamento_delete(uuid, public.financeiro_meio_pagamento_tipo);
create or replace function public.financeiro_meios_pagamento_delete(
  p_id uuid,
  p_tipo public.financeiro_meio_pagamento_tipo
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_nome text;
  v_is_system boolean;
  v_used_count bigint := 0;
begin
  if p_id is null then
    raise exception '[FIN][MEIOS] id é obrigatório.' using errcode='P0001';
  end if;

  -- Permissão mínima para manutenção do cadastro (delete seguro).
  if p_tipo = 'pagamento' then
    perform public.require_permission_for_current_user('contas_a_pagar','update');
  else
    perform public.require_permission_for_current_user('contas_a_receber','update');
  end if;

  select m.nome, m.is_system
    into v_nome, v_is_system
  from public.financeiro_meios_pagamento m
  where m.id = p_id
    and m.empresa_id = v_empresa
    and m.tipo = p_tipo;

  if v_nome is null then
    raise exception '[FIN][MEIOS] Registro não encontrado/negado.' using errcode='P0002';
  end if;

  if v_is_system then
    raise exception '[FIN][MEIOS] Não é possível excluir um meio padrão do sistema.' using errcode='P0001';
  end if;

  -- Checagem de uso (por nome, case-insensitive)
  if p_tipo = 'pagamento' then
    if to_regclass('public.financeiro_contas_pagar') is not null then
      select count(*) into v_used_count
      from public.financeiro_contas_pagar cp
      where cp.empresa_id = v_empresa
        and cp.forma_pagamento is not null
        and lower(cp.forma_pagamento) = lower(v_nome);
    end if;

    if v_used_count = 0 and to_regclass('public.financeiro_recorrencias') is not null then
      select count(*) into v_used_count
      from public.financeiro_recorrencias r
      where r.empresa_id = v_empresa
        and r.tipo::text = 'pagar'
        and r.forma_pagamento is not null
        and lower(r.forma_pagamento) = lower(v_nome);
    end if;
  else
    if to_regclass('public.ordem_servicos') is not null then
      select count(*) into v_used_count
      from public.ordem_servicos os
      where os.empresa_id = v_empresa
        and os.forma_recebimento is not null
        and lower(os.forma_recebimento) = lower(v_nome);
    end if;
  end if;

  if v_used_count > 0 then
    raise exception '[FIN][MEIOS] Não é possível excluir: este meio já foi utilizado (%).', v_used_count using errcode='P0001';
  end if;

  delete from public.financeiro_meios_pagamento m
  where m.id = p_id
    and m.empresa_id = v_empresa
    and m.tipo = p_tipo
    and m.is_system = false;

  return jsonb_build_object('ok', true, 'id', p_id::text);
end;
$$;

revoke all on function public.financeiro_meios_pagamento_delete(uuid, public.financeiro_meio_pagamento_tipo) from public, anon;
grant execute on function public.financeiro_meios_pagamento_delete(uuid, public.financeiro_meio_pagamento_tipo) to authenticated, service_role;

commit;

