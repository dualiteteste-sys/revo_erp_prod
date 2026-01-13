/*
  Financeiro: Meios de Pagamento/Recebimento — Admin (list/toggle)

  Motivação:
  - A RPC de autocomplete retorna apenas ativos (para formulários).
  - O cadastro precisa listar também inativos e permitir ativar/inativar (inclusive itens system).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Listagem administrativa (inclui inativos)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_meios_pagamento_list(public.financeiro_meio_pagamento_tipo, text, text, int);
create or replace function public.financeiro_meios_pagamento_list(
  p_tipo public.financeiro_meio_pagamento_tipo,
  p_q text default null,
  p_status text default 'all', -- all|ativo|inativo
  p_limit int default 200
)
returns table(
  id uuid,
  nome text,
  tipo public.financeiro_meio_pagamento_tipo,
  ativo boolean,
  is_system boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_q text := nullif(btrim(coalesce(p_q,'')), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  if p_tipo = 'pagamento' then
    perform public.require_permission_for_current_user('contas_a_pagar','view');
  else
    perform public.require_permission_for_current_user('contas_a_receber','view');
  end if;

  return query
  select m.id, m.nome, m.tipo, m.ativo, m.is_system, m.created_at, m.updated_at
  from public.financeiro_meios_pagamento m
  where m.empresa_id = v_empresa
    and m.tipo = p_tipo
    and (
      v_q is null
      or m.nome ilike '%'||v_q||'%'
    )
    and (
      p_status = 'all'
      or (p_status = 'ativo' and m.ativo = true)
      or (p_status = 'inativo' and m.ativo = false)
    )
  order by m.is_system desc, m.nome asc
  limit v_limit;
end;
$$;

revoke all on function public.financeiro_meios_pagamento_list(public.financeiro_meio_pagamento_tipo, text, text, int) from public, anon;
grant execute on function public.financeiro_meios_pagamento_list(public.financeiro_meio_pagamento_tipo, text, text, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Toggle ativo (permite system também, só altera ativo)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_meios_pagamento_set_ativo(uuid, public.financeiro_meio_pagamento_tipo, boolean);
create or replace function public.financeiro_meios_pagamento_set_ativo(
  p_id uuid,
  p_tipo public.financeiro_meio_pagamento_tipo,
  p_ativo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_ok uuid;
  v_res jsonb;
begin
  if p_id is null then
    raise exception '[FIN][MEIOS] id é obrigatório.' using errcode='P0001';
  end if;

  if p_tipo = 'pagamento' then
    perform public.require_permission_for_current_user('contas_a_pagar','update');
  else
    perform public.require_permission_for_current_user('contas_a_receber','update');
  end if;

  update public.financeiro_meios_pagamento m
     set ativo = coalesce(p_ativo, false),
         updated_at = now()
   where m.id = p_id
     and m.empresa_id = v_empresa
     and m.tipo = p_tipo
  returning m.id into v_ok;

  if v_ok is null then
    raise exception '[FIN][MEIOS] Registro não encontrado/negado.' using errcode='P0002';
  end if;

  select to_jsonb(m.*) into v_res
  from public.financeiro_meios_pagamento m
  where m.id = v_ok and m.empresa_id = v_empresa;

  return v_res;
end;
$$;

revoke all on function public.financeiro_meios_pagamento_set_ativo(uuid, public.financeiro_meio_pagamento_tipo, boolean) from public, anon;
grant execute on function public.financeiro_meios_pagamento_set_ativo(uuid, public.financeiro_meio_pagamento_tipo, boolean) to authenticated, service_role;

commit;

