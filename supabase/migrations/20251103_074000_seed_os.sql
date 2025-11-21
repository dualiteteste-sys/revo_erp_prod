-- 20251103_074000_seed_os.sql (CORRIGIDA)
-- Seed: Ordens de Serviço padrão (multi-tenant, idempotente)
-- Logs: [SEED][OS]

create or replace function public.seed_os_for_current_user()
returns setof public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();

  -- descrições-âncora (idempotência)
  v_desc1 text := 'Orçamento: Manutenção de Computador';
  v_desc2 text := 'Instalação de Sistema de Vendas';
  v_desc3 text := 'Visita Técnica para Calibração';

  -- entidades selecionadas deterministicamente
  v_cli1 uuid; v_cli2 uuid;
  v_prd1 uuid; v_prd2 uuid;
  v_srv1 uuid; v_srv2 uuid;

  v_os_id uuid;
  v_created uuid[] := '{}';
begin
  if v_emp is null then
    raise exception '[SEED][OS] empresa_id inválido' using errcode='42501';
  end if;

  -- Garantir dados-base (idempotentes)
  -- Parceiros (clientes/ambos)
  perform public.seed_partners_for_current_user();
  -- Serviços
  perform public.seed_services_for_current_user();
  -- Produtos
  perform public.seed_products_for_current_user();

  -- Seleciona clientes
  select id into v_cli1
    from public.pessoas
   where empresa_id = v_emp and tipo in ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
   order by nome asc
   limit 1;

  select id into v_cli2
    from public.pessoas
   where empresa_id = v_emp and tipo in ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
   order by nome asc
   offset 1 limit 1;

  -- Seleciona produtos
  select id into v_prd1
    from public.produtos
   where empresa_id = v_emp
   order by nome asc
   limit 1;

  select id into v_prd2
    from public.produtos
   where empresa_id = v_emp
   order by nome asc
   offset 1 limit 1;

  -- Seleciona serviços
  select id into v_srv1
    from public.servicos
   where empresa_id = v_emp
   order by descricao asc
   limit 1;

  select id into v_srv2
    from public.servicos
   where empresa_id = v_emp
   order by descricao asc
   offset 1 limit 1;

  -- Verificação mínima
  if v_cli1 is null or v_prd1 is null or v_srv1 is null then
    raise notice '[SEED] [OS] Dados insuficientes (cliente/produto/serviço).';
    return;
  end if;

  -- Fallbacks (evita índices fora do limite)
  v_cli2 := coalesce(v_cli2, v_cli1);
  v_prd2 := coalesce(v_prd2, v_prd1);
  v_srv2 := coalesce(v_srv2, v_srv1);

  -- OS 1
  if not exists (
    select 1 from public.ordem_servicos where empresa_id = v_emp and descricao = v_desc1
  ) then
    insert into public.ordem_servicos (empresa_id, cliente_id, descricao, status, data_inicio)
    values (v_emp, v_cli1, v_desc1, 'orcamento'::public.status_os, (now() - interval '3 days')::date)
    returning id into v_os_id;

    v_created := array_append(v_created, v_os_id);

    perform public.add_service_item_to_os_for_current_user(v_os_id, v_srv1, 1, 0, false);
    perform public.add_product_item_to_os_for_current_user(v_os_id, v_prd1, 1, 0, false);
    perform pg_notify('app_log', '[SEED] [OS] criada OS 1 ' || v_os_id::text);
  end if;

  -- OS 2
  if not exists (
    select 1 from public.ordem_servicos where empresa_id = v_emp and descricao = v_desc2
  ) then
    insert into public.ordem_servicos (empresa_id, cliente_id, descricao, status, data_inicio)
    values (v_emp, v_cli2, v_desc2, 'aberta'::public.status_os, (now() - interval '1 day')::date)
    returning id into v_os_id;

    v_created := array_append(v_created, v_os_id);

    perform public.add_service_item_to_os_for_current_user(v_os_id, v_srv2, 2, 0, false);
    perform public.add_product_item_to_os_for_current_user(v_os_id, v_prd2, 1, 0, false);
    perform pg_notify('app_log', '[SEED] [OS] criada OS 2 ' || v_os_id::text);
  end if;

  -- OS 3
  if not exists (
    select 1 from public.ordem_servicos where empresa_id = v_emp and descricao = v_desc3
  ) then
    insert into public.ordem_servicos (empresa_id, cliente_id, descricao, status, data_inicio)
    values (v_emp, v_cli1, v_desc3, 'concluida'::public.status_os, (now() - interval '5 days')::date)
    returning id into v_os_id;

    v_created := array_append(v_created, v_os_id);

    perform public.add_service_item_to_os_for_current_user(v_os_id, v_srv1, 1, 0, false);
    perform public.add_service_item_to_os_for_current_user(v_os_id, v_srv2, 1, 0, false);
    perform pg_notify('app_log', '[SEED] [OS] criada OS 3 ' || v_os_id::text);
  end if;

  return query
    select *
      from public.ordem_servicos
     where id = any(v_created)
     order by created_at desc;
end;
$$;

revoke all on function public.seed_os_for_current_user() from public;
grant execute on function public.seed_os_for_current_user() to authenticated;
grant execute on function public.seed_os_for_current_user() to service_role;
