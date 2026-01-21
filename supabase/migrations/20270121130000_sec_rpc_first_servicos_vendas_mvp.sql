/*
  SEC-RPC-FIRST-06: remover PostgREST direto (client-side) em tabelas legacy (MVP)

  - Serviços (MVP): substituir `.from('servicos_*')` por RPCs.
  - Vendas (MVP): substituir `.from('vendas_expedicoes|vendas_automacoes|vendas_devolucoes')` por RPCs.

  Objetivo:
  - reduzir allowlist PostgREST no frontend
  - manter multi-tenant via `current_empresa_id()` + RBAC
  - facilitar evolução para transações/idempotência em operações multi-tabela
*/

begin;

-- -----------------------------------------------------------------------------
-- SERVIÇOS (MVP): Contratos / Notas / Cobranças
-- -----------------------------------------------------------------------------

drop function if exists public.servicos_contratos_list(integer);
create function public.servicos_contratos_list(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 2000);
begin
  perform public.require_permission_for_current_user('servicos','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.updated_at desc nulls last)
    from (
      select *
      from public.servicos_contratos c
      where c.empresa_id = v_empresa
      order by c.updated_at desc nulls last
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.servicos_contratos_list(integer) from public, anon;
grant execute on function public.servicos_contratos_list(integer) to authenticated, service_role;


drop function if exists public.servicos_contratos_upsert(jsonb);
create function public.servicos_contratos_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_row public.servicos_contratos;
begin
  perform public.require_permission_for_current_user('servicos','update');

  insert into public.servicos_contratos(
    id,
    empresa_id,
    cliente_id,
    servico_id,
    numero,
    descricao,
    valor_mensal,
    status,
    data_inicio,
    data_fim,
    fidelidade_meses,
    observacoes
  )
  values (
    coalesce(v_id, gen_random_uuid()),
    v_empresa,
    nullif(p_payload->>'cliente_id','')::uuid,
    nullif(p_payload->>'servico_id','')::uuid,
    nullif(p_payload->>'numero',''),
    coalesce(nullif(p_payload->>'descricao',''), ''),
    coalesce((p_payload->>'valor_mensal')::numeric, 0),
    coalesce(nullif(p_payload->>'status',''), 'ativo'),
    coalesce(nullif(p_payload->>'data_inicio','')::date, current_date),
    nullif(p_payload->>'data_fim','')::date,
    nullif(p_payload->>'fidelidade_meses','')::int,
    nullif(p_payload->>'observacoes','')
  )
  on conflict (id)
  do update set
    cliente_id = excluded.cliente_id,
    servico_id = excluded.servico_id,
    numero = excluded.numero,
    descricao = excluded.descricao,
    valor_mensal = excluded.valor_mensal,
    status = excluded.status,
    data_inicio = excluded.data_inicio,
    data_fim = excluded.data_fim,
    fidelidade_meses = excluded.fidelidade_meses,
    observacoes = excluded.observacoes,
    updated_at = now()
  where public.servicos_contratos.empresa_id = v_empresa
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.servicos_contratos_upsert(jsonb) from public, anon;
grant execute on function public.servicos_contratos_upsert(jsonb) to authenticated, service_role;


drop function if exists public.servicos_contratos_delete(uuid);
create function public.servicos_contratos_delete(
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_count int;
begin
  perform public.require_permission_for_current_user('servicos','update');

  delete from public.servicos_contratos
  where empresa_id = v_empresa and id = p_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.servicos_contratos_delete(uuid) from public, anon;
grant execute on function public.servicos_contratos_delete(uuid) to authenticated, service_role;


drop function if exists public.servicos_notas_list(integer);
create function public.servicos_notas_list(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 2000);
begin
  perform public.require_permission_for_current_user('servicos','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.updated_at desc nulls last)
    from (
      select *
      from public.servicos_notas n
      where n.empresa_id = v_empresa
      order by n.updated_at desc nulls last
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.servicos_notas_list(integer) from public, anon;
grant execute on function public.servicos_notas_list(integer) to authenticated, service_role;


drop function if exists public.servicos_notas_upsert(jsonb);
create function public.servicos_notas_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_row public.servicos_notas;
begin
  perform public.require_permission_for_current_user('servicos','update');

  insert into public.servicos_notas(
    id,
    empresa_id,
    contrato_id,
    competencia,
    descricao,
    valor,
    status
  )
  values (
    coalesce(v_id, gen_random_uuid()),
    v_empresa,
    nullif(p_payload->>'contrato_id','')::uuid,
    nullif(p_payload->>'competencia','')::date,
    coalesce(nullif(p_payload->>'descricao',''), ''),
    coalesce((p_payload->>'valor')::numeric, 0),
    coalesce(nullif(p_payload->>'status',''), 'rascunho')
  )
  on conflict (id)
  do update set
    contrato_id = excluded.contrato_id,
    competencia = excluded.competencia,
    descricao = excluded.descricao,
    valor = excluded.valor,
    status = excluded.status,
    updated_at = now()
  where public.servicos_notas.empresa_id = v_empresa
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.servicos_notas_upsert(jsonb) from public, anon;
grant execute on function public.servicos_notas_upsert(jsonb) to authenticated, service_role;


drop function if exists public.servicos_notas_delete(uuid);
create function public.servicos_notas_delete(
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_count int;
begin
  perform public.require_permission_for_current_user('servicos','update');

  delete from public.servicos_notas
  where empresa_id = v_empresa and id = p_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.servicos_notas_delete(uuid) from public, anon;
grant execute on function public.servicos_notas_delete(uuid) to authenticated, service_role;


drop function if exists public.servicos_cobrancas_list(integer);
create function public.servicos_cobrancas_list(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 2000);
begin
  perform public.require_permission_for_current_user('servicos','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.updated_at desc nulls last)
    from (
      select *
      from public.servicos_cobrancas c
      where c.empresa_id = v_empresa
      order by c.updated_at desc nulls last
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.servicos_cobrancas_list(integer) from public, anon;
grant execute on function public.servicos_cobrancas_list(integer) to authenticated, service_role;


drop function if exists public.servicos_cobrancas_upsert(jsonb);
create function public.servicos_cobrancas_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_row public.servicos_cobrancas;
begin
  perform public.require_permission_for_current_user('servicos','update');

  insert into public.servicos_cobrancas(
    id,
    empresa_id,
    nota_id,
    cliente_id,
    data_vencimento,
    valor,
    status,
    conta_a_receber_id
  )
  values (
    coalesce(v_id, gen_random_uuid()),
    v_empresa,
    nullif(p_payload->>'nota_id','')::uuid,
    nullif(p_payload->>'cliente_id','')::uuid,
    coalesce(nullif(p_payload->>'data_vencimento','')::date, current_date),
    coalesce((p_payload->>'valor')::numeric, 0),
    coalesce(nullif(p_payload->>'status',''), 'pendente'),
    nullif(p_payload->>'conta_a_receber_id','')::uuid
  )
  on conflict (id)
  do update set
    nota_id = excluded.nota_id,
    cliente_id = excluded.cliente_id,
    data_vencimento = excluded.data_vencimento,
    valor = excluded.valor,
    status = excluded.status,
    conta_a_receber_id = excluded.conta_a_receber_id,
    updated_at = now()
  where public.servicos_cobrancas.empresa_id = v_empresa
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.servicos_cobrancas_upsert(jsonb) from public, anon;
grant execute on function public.servicos_cobrancas_upsert(jsonb) to authenticated, service_role;


drop function if exists public.servicos_cobrancas_delete(uuid);
create function public.servicos_cobrancas_delete(
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_count int;
begin
  perform public.require_permission_for_current_user('servicos','update');

  delete from public.servicos_cobrancas
  where empresa_id = v_empresa and id = p_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.servicos_cobrancas_delete(uuid) from public, anon;
grant execute on function public.servicos_cobrancas_delete(uuid) to authenticated, service_role;


drop function if exists public.servicos_cobrancas_set_conta_a_receber(uuid, uuid);
create function public.servicos_cobrancas_set_conta_a_receber(
  p_cobranca_id uuid,
  p_conta_a_receber_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('servicos','update');

  update public.servicos_cobrancas
     set conta_a_receber_id = p_conta_a_receber_id,
         updated_at = now()
   where empresa_id = v_empresa and id = p_cobranca_id;
end;
$$;

revoke all on function public.servicos_cobrancas_set_conta_a_receber(uuid, uuid) from public, anon;
grant execute on function public.servicos_cobrancas_set_conta_a_receber(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- SERVIÇOS: Billing Rules / Schedule (leitura/escrita simples RPC-first)
-- -----------------------------------------------------------------------------

drop function if exists public.servicos_contratos_billing_rule_get(uuid);
create function public.servicos_contratos_billing_rule_get(
  p_contrato_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_row public.servicos_contratos_billing_rules;
begin
  perform public.require_permission_for_current_user('servicos','view');

  select * into v_row
  from public.servicos_contratos_billing_rules r
  where r.empresa_id = v_empresa and r.contrato_id = p_contrato_id
  limit 1;

  if not found then
    return null;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.servicos_contratos_billing_rule_get(uuid) from public, anon;
grant execute on function public.servicos_contratos_billing_rule_get(uuid) to authenticated, service_role;


drop function if exists public.servicos_contratos_billing_rule_upsert(jsonb);
create function public.servicos_contratos_billing_rule_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_contrato_id uuid := nullif(p_payload->>'contrato_id','')::uuid;
  v_row public.servicos_contratos_billing_rules;
begin
  perform public.require_permission_for_current_user('servicos','update');

  if v_contrato_id is null then
    raise exception 'contrato_id é obrigatório.' using errcode='22023';
  end if;

  insert into public.servicos_contratos_billing_rules(
    empresa_id,
    contrato_id,
    tipo,
    ativo,
    valor_mensal,
    dia_vencimento,
    primeira_competencia,
    centro_de_custo_id
  )
  values (
    v_empresa,
    v_contrato_id,
    coalesce(nullif(p_payload->>'tipo',''), 'mensal'),
    coalesce((p_payload->>'ativo')::boolean, true),
    coalesce((p_payload->>'valor_mensal')::numeric, 0),
    coalesce((p_payload->>'dia_vencimento')::int, 5),
    coalesce(nullif(p_payload->>'primeira_competencia','')::date, date_trunc('month', current_date)::date),
    nullif(p_payload->>'centro_de_custo_id','')::uuid
  )
  on conflict (empresa_id, contrato_id)
  do update set
    tipo = excluded.tipo,
    ativo = excluded.ativo,
    valor_mensal = excluded.valor_mensal,
    dia_vencimento = excluded.dia_vencimento,
    primeira_competencia = excluded.primeira_competencia,
    centro_de_custo_id = excluded.centro_de_custo_id,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.servicos_contratos_billing_rule_upsert(jsonb) from public, anon;
grant execute on function public.servicos_contratos_billing_rule_upsert(jsonb) to authenticated, service_role;


drop function if exists public.servicos_contratos_billing_schedule_list(uuid, integer);
create function public.servicos_contratos_billing_schedule_list(
  p_contrato_id uuid,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 500);
begin
  perform public.require_permission_for_current_user('servicos','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.data_vencimento asc, x.created_at asc)
    from (
      select *
      from public.servicos_contratos_billing_schedule s
      where s.empresa_id = v_empresa and s.contrato_id = p_contrato_id
      order by s.data_vencimento asc, s.created_at asc
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.servicos_contratos_billing_schedule_list(uuid, integer) from public, anon;
grant execute on function public.servicos_contratos_billing_schedule_list(uuid, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- SERVIÇOS: Itens do contrato
-- -----------------------------------------------------------------------------

drop function if exists public.servicos_contratos_itens_list(uuid);
create function public.servicos_contratos_itens_list(
  p_contrato_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('servicos','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.pos asc, x.created_at asc)
    from (
      select *
      from public.servicos_contratos_itens i
      where i.empresa_id = v_empresa and i.contrato_id = p_contrato_id
      order by i.pos asc, i.created_at asc
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.servicos_contratos_itens_list(uuid) from public, anon;
grant execute on function public.servicos_contratos_itens_list(uuid) to authenticated, service_role;


drop function if exists public.servicos_contratos_itens_upsert(jsonb);
create function public.servicos_contratos_itens_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_contrato_id uuid := nullif(p_payload->>'contrato_id','')::uuid;
  v_row public.servicos_contratos_itens;
begin
  perform public.require_permission_for_current_user('servicos','update');

  if v_contrato_id is null then
    raise exception 'contrato_id é obrigatório.' using errcode='22023';
  end if;

  insert into public.servicos_contratos_itens(
    id,
    empresa_id,
    contrato_id,
    pos,
    titulo,
    descricao,
    quantidade,
    unidade,
    valor_unitario,
    recorrente
  )
  values (
    coalesce(v_id, gen_random_uuid()),
    v_empresa,
    v_contrato_id,
    coalesce((p_payload->>'pos')::int, 0),
    coalesce(nullif(p_payload->>'titulo',''), ''),
    nullif(p_payload->>'descricao',''),
    coalesce((p_payload->>'quantidade')::numeric, 1),
    nullif(p_payload->>'unidade',''),
    coalesce((p_payload->>'valor_unitario')::numeric, 0),
    coalesce((p_payload->>'recorrente')::boolean, false)
  )
  on conflict (id)
  do update set
    pos = excluded.pos,
    titulo = excluded.titulo,
    descricao = excluded.descricao,
    quantidade = excluded.quantidade,
    unidade = excluded.unidade,
    valor_unitario = excluded.valor_unitario,
    recorrente = excluded.recorrente,
    updated_at = now()
  where public.servicos_contratos_itens.empresa_id = v_empresa
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.servicos_contratos_itens_upsert(jsonb) from public, anon;
grant execute on function public.servicos_contratos_itens_upsert(jsonb) to authenticated, service_role;


drop function if exists public.servicos_contratos_itens_delete(uuid);
create function public.servicos_contratos_itens_delete(
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_count int;
begin
  perform public.require_permission_for_current_user('servicos','update');

  delete from public.servicos_contratos_itens
  where empresa_id = v_empresa and id = p_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.servicos_contratos_itens_delete(uuid) from public, anon;
grant execute on function public.servicos_contratos_itens_delete(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- SERVIÇOS: Templates (admin via app)
-- -----------------------------------------------------------------------------

drop function if exists public.servicos_contratos_templates_upsert(jsonb);
create function public.servicos_contratos_templates_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_slug text := nullif(btrim(p_payload->>'slug'), '');
  v_row public.servicos_contratos_templates;
begin
  perform public.require_permission_for_current_user('servicos','update');

  if v_slug is null then
    raise exception 'slug é obrigatório.' using errcode='22023';
  end if;

  insert into public.servicos_contratos_templates(
    id,
    empresa_id,
    slug,
    titulo,
    corpo,
    active
  )
  values (
    coalesce(v_id, gen_random_uuid()),
    v_empresa,
    v_slug,
    coalesce(nullif(p_payload->>'titulo',''), ''),
    coalesce(nullif(p_payload->>'corpo',''), ''),
    coalesce((p_payload->>'active')::boolean, true)
  )
  on conflict (empresa_id, slug)
  do update set
    titulo = excluded.titulo,
    corpo = excluded.corpo,
    active = excluded.active,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.servicos_contratos_templates_upsert(jsonb) from public, anon;
grant execute on function public.servicos_contratos_templates_upsert(jsonb) to authenticated, service_role;


drop function if exists public.servicos_contratos_templates_delete(uuid);
create function public.servicos_contratos_templates_delete(
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_count int;
begin
  perform public.require_permission_for_current_user('servicos','update');

  delete from public.servicos_contratos_templates
  where empresa_id = v_empresa and id = p_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.servicos_contratos_templates_delete(uuid) from public, anon;
grant execute on function public.servicos_contratos_templates_delete(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VENDAS (MVP): Expedicoes / Automacoes / Devolucoes
-- -----------------------------------------------------------------------------

drop function if exists public.vendas_expedicoes_list(integer);
create function public.vendas_expedicoes_list(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 2000);
begin
  perform public.require_permission_for_current_user('vendas','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.updated_at desc nulls last)
    from (
      select *
      from public.vendas_expedicoes e
      where e.empresa_id = v_empresa
      order by e.updated_at desc nulls last
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.vendas_expedicoes_list(integer) from public, anon;
grant execute on function public.vendas_expedicoes_list(integer) to authenticated, service_role;


drop function if exists public.vendas_expedicao_eventos_list(uuid, integer);
create function public.vendas_expedicao_eventos_list(
  p_expedicao_id uuid,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 2000);
begin
  perform public.require_permission_for_current_user('vendas','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc nulls last)
    from (
      select *
      from public.vendas_expedicao_eventos ev
      where ev.empresa_id = v_empresa
        and ev.expedicao_id = p_expedicao_id
      order by ev.created_at desc nulls last
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.vendas_expedicao_eventos_list(uuid, integer) from public, anon;
grant execute on function public.vendas_expedicao_eventos_list(uuid, integer) to authenticated, service_role;


drop function if exists public.vendas_expedicoes_upsert(jsonb);
create function public.vendas_expedicoes_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_pedido_id uuid := nullif(p_payload->>'pedido_id','')::uuid;
  v_row public.vendas_expedicoes;
begin
  perform public.require_permission_for_current_user('vendas','update');

  if v_pedido_id is null then
    raise exception 'pedido_id é obrigatório.' using errcode='22023';
  end if;

  insert into public.vendas_expedicoes(
    empresa_id,
    pedido_id,
    status,
    transportadora_id,
    tracking_code,
    data_envio,
    data_entrega,
    observacoes
  )
  values (
    v_empresa,
    v_pedido_id,
    coalesce(nullif(p_payload->>'status',''), 'separando'),
    nullif(p_payload->>'transportadora_id','')::uuid,
    nullif(p_payload->>'tracking_code',''),
    nullif(p_payload->>'data_envio','')::date,
    nullif(p_payload->>'data_entrega','')::date,
    nullif(p_payload->>'observacoes','')
  )
  on conflict (empresa_id, pedido_id)
  do update set
    status = excluded.status,
    transportadora_id = excluded.transportadora_id,
    tracking_code = excluded.tracking_code,
    data_envio = excluded.data_envio,
    data_entrega = excluded.data_entrega,
    observacoes = excluded.observacoes,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.vendas_expedicoes_upsert(jsonb) from public, anon;
grant execute on function public.vendas_expedicoes_upsert(jsonb) to authenticated, service_role;


drop function if exists public.vendas_automacoes_list(integer);
create function public.vendas_automacoes_list(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 2000);
begin
  perform public.require_permission_for_current_user('vendas','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.updated_at desc nulls last)
    from (
      select *
      from public.vendas_automacoes a
      where a.empresa_id = v_empresa
      order by a.updated_at desc nulls last
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.vendas_automacoes_list(integer) from public, anon;
grant execute on function public.vendas_automacoes_list(integer) to authenticated, service_role;


drop function if exists public.vendas_automacoes_upsert(jsonb);
create function public.vendas_automacoes_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_row public.vendas_automacoes;
begin
  perform public.require_permission_for_current_user('vendas','update');

  insert into public.vendas_automacoes(
    id,
    empresa_id,
    nome,
    gatilho,
    enabled,
    config
  )
  values (
    coalesce(v_id, gen_random_uuid()),
    v_empresa,
    coalesce(nullif(p_payload->>'nome',''), ''),
    coalesce(nullif(p_payload->>'gatilho',''), ''),
    coalesce((p_payload->>'enabled')::boolean, true),
    coalesce(p_payload->'config', '{}'::jsonb)
  )
  on conflict (id)
  do update set
    nome = excluded.nome,
    gatilho = excluded.gatilho,
    enabled = excluded.enabled,
    config = excluded.config,
    updated_at = now()
  where public.vendas_automacoes.empresa_id = v_empresa
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.vendas_automacoes_upsert(jsonb) from public, anon;
grant execute on function public.vendas_automacoes_upsert(jsonb) to authenticated, service_role;


drop function if exists public.vendas_automacoes_delete(uuid);
create function public.vendas_automacoes_delete(
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_count int;
begin
  perform public.require_permission_for_current_user('vendas','update');

  delete from public.vendas_automacoes
  where empresa_id = v_empresa and id = p_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.vendas_automacoes_delete(uuid) from public, anon;
grant execute on function public.vendas_automacoes_delete(uuid) to authenticated, service_role;


drop function if exists public.vendas_devolucoes_list(integer);
create function public.vendas_devolucoes_list(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 2000);
begin
  perform public.require_permission_for_current_user('vendas','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by (x->>'created_at')::timestamptz desc nulls last)
    from (
      select to_jsonb(d) || jsonb_build_object(
        'itens',
        coalesce((
          select jsonb_agg(to_jsonb(di) order by di.created_at asc)
          from public.vendas_devolucao_itens di
          where di.empresa_id = v_empresa and di.devolucao_id = d.id
        ), '[]'::jsonb)
      ) as x
      from public.vendas_devolucoes d
      where d.empresa_id = v_empresa
      order by d.created_at desc nulls last
      limit v_limit
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.vendas_devolucoes_list(integer) from public, anon;
grant execute on function public.vendas_devolucoes_list(integer) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Hardening: remover grants diretos dessas tabelas (acesso via RPC)
-- -----------------------------------------------------------------------------
revoke all on table
  public.servicos_contratos,
  public.servicos_notas,
  public.servicos_cobrancas,
  public.servicos_contratos_billing_rules,
  public.servicos_contratos_billing_schedule,
  public.servicos_contratos_itens,
  public.servicos_contratos_templates,
  public.vendas_expedicoes,
  public.vendas_expedicao_eventos,
  public.vendas_automacoes,
  public.vendas_devolucoes,
  public.vendas_devolucao_itens
from authenticated, anon, public;

grant all on table
  public.servicos_contratos,
  public.servicos_notas,
  public.servicos_cobrancas,
  public.servicos_contratos_billing_rules,
  public.servicos_contratos_billing_schedule,
  public.servicos_contratos_itens,
  public.servicos_contratos_templates,
  public.vendas_expedicoes,
  public.vendas_expedicao_eventos,
  public.vendas_automacoes,
  public.vendas_devolucoes,
  public.vendas_devolucao_itens
to service_role;

select pg_notify('pgrst','reload schema');

commit;

