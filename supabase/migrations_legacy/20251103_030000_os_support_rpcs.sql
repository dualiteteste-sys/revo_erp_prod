-- 20251103_030000_os_support_rpcs.sql
-- Suporte ao módulo OS: listar itens, buscar serviços e clonar OS
-- Logs: [RPC] [OS] [OS_ITEM]

-- =========================
-- LISTAR ITENS DA OS
-- =========================
create or replace function public.list_os_items_for_current_user(p_os_id uuid)
returns setof public.ordem_servico_itens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.ordem_servicos
                 where id = p_os_id and empresa_id = public.current_empresa_id()) then
    raise exception '[RPC][OS_ITEM][LIST] OS fora da empresa atual' using errcode='42501';
  end if;

  return query
  select i.*
  from public.ordem_servico_itens i
  where i.ordem_servico_id = p_os_id
    and i.empresa_id = public.current_empresa_id()
  order by i.created_at desc;
end;
$$;

revoke all on function public.list_os_items_for_current_user(uuid) from public;
grant execute on function public.list_os_items_for_current_user(uuid) to authenticated;
grant execute on function public.list_os_items_for_current_user(uuid) to service_role;

-- =========================
-- BUSCA DE SERVIÇOS (autocomplete)
-- =========================
create or replace function public.search_services_for_current_user(
  p_search text default null,
  p_limit int default 20
)
returns table (
  id uuid,
  descricao text,
  codigo text,
  preco_venda numeric,
  unidade text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select s.id, s.descricao, s.codigo, s.preco_venda, s.unidade
  from public.servicos s
  where s.empresa_id = public.current_empresa_id()
    and (p_search is null
         or s.descricao ilike '%'||p_search||'%'
         or coalesce(s.codigo,'') ilike '%'||p_search||'%')
  order by s.descricao asc
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.search_services_for_current_user(text, int) from public;
grant execute on function public.search_services_for_current_user(text, int) to authenticated;
grant execute on function public.search_services_for_current_user(text, int) to service_role;

-- =========================
-- CLONAR OS (cabeçalho + itens)
-- =========================
create or replace function public.create_os_clone_for_current_user(
  p_source_os_id uuid,
  p_overrides jsonb default '{}'::jsonb
)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_src public.ordem_servicos;
  v_new public.ordem_servicos;
begin
  if v_emp is null then
    raise exception '[RPC][OS][CLONE] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_src
  from public.ordem_servicos
  where id = p_source_os_id and empresa_id = v_emp;

  if not found then
    raise exception '[RPC][OS][CLONE] OS não encontrada na empresa atual' using errcode='P0002';
  end if;

  -- cria cabeçalho novo (status volta para 'orcamento', datas limpas; número novo)
  insert into public.ordem_servicos (
    id, empresa_id, numero, cliente_id, status,
    descricao, consideracoes_finais,
    data_inicio, data_prevista, hora, data_conclusao,
    desconto_valor, vendedor, comissao_percentual, comissao_valor,
    tecnico, orcar, forma_recebimento, meio, conta_bancaria, categoria_financeira,
    condicao_pagamento, observacoes, observacoes_internas, anexos, marcadores
  )
  values (
    gen_random_uuid(),
    v_emp,
    public.next_os_number_for_current_empresa(),
    coalesce(nullif(p_overrides->>'cliente_id','')::uuid, v_src.cliente_id),
    'orcamento',
    coalesce(nullif(p_overrides->>'descricao',''), v_src.descricao),
    coalesce(nullif(p_overrides->>'consideracoes_finais',''), v_src.consideracoes_finais),
    null, null, null, null,
    coalesce(nullif(p_overrides->>'desconto_valor','')::numeric, v_src.desconto_valor),
    v_src.vendedor, v_src.comissao_percentual, v_src.comissao_valor,
    v_src.tecnico, false, v_src.forma_recebimento, v_src.meio, v_src.conta_bancaria, v_src.categoria_financeira,
    v_src.condicao_pagamento, v_src.observacoes, v_src.observacoes_internas, v_src.anexos, v_src.marcadores
  )
  returning * into v_new;

  -- clona itens
  insert into public.ordem_servico_itens (
    empresa_id, ordem_servico_id, servico_id, descricao, codigo,
    quantidade, preco, desconto_pct, total, orcar
  )
  select v_emp, v_new.id, i.servico_id, i.descricao, i.codigo,
         i.quantidade, i.preco, i.desconto_pct, 0, i.orcar
  from public.ordem_servico_itens i
  where i.ordem_servico_id = v_src.id
    and i.empresa_id = v_emp;

  -- recalcula totais da nova OS
  perform public.os_recalc_totals(v_new.id);

  perform pg_notify('app_log', '[RPC] [OS][CLONE] ' || v_new.id::text);
  return v_new;
end;
$$;

revoke all on function public.create_os_clone_for_current_user(uuid, jsonb) from public;
grant execute on function public.create_os_clone_for_current_user(uuid, jsonb) to authenticated;
grant execute on function public.create_os_clone_for_current_user(uuid, jsonb) to service_role;
