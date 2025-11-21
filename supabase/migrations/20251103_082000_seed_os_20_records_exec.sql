-- 20251103_082000_seed_os_20_records_exec.sql
-- Seed: sempre cria N novas O.S. por execução (default 20)
-- Logs: [SEED][OS]

drop function if exists public.seed_os_for_current_user();

create function public.seed_os_for_current_user(p_count int default 20)
returns setof public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_user_id uuid := public.current_user_id();

  v_cli_count int;
  v_svc_count int;
  v_prd_count int;

  v_i int;
  v_os_id uuid;

  v_cli uuid;
  v_svc uuid;
  v_prd uuid;

  v_desc text;
  v_batch_id text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'); -- identifica a execução
  v_created_ids uuid[] := '{}';
begin
  if v_emp is null or v_user_id is null then
    raise exception '[SEED][OS] empresa ou usuário inválido' using errcode='42501';
  end if;

  -- Garante dados-base idempotentes (não afeta a criação do batch atual)
  perform public.seed_partners_for_current_user();
  perform public.seed_services_for_current_user();
  perform public.seed_products_for_current_user();

  -- Contagens atualizadas
  select count(*) into v_cli_count
    from public.pessoas
   where empresa_id = v_emp
     and tipo in ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo);

  select count(*) into v_svc_count
    from public.servicos
   where empresa_id = v_emp;

  select count(*) into v_prd_count
    from public.produtos
   where empresa_id = v_emp;

  if v_cli_count = 0 or v_svc_count = 0 or v_prd_count = 0 then
    raise exception '[SEED][OS] Dados insuficientes: clientes=% servicos=% produtos=%',
      v_cli_count, v_svc_count, v_prd_count
      using errcode='P0002';
  end if;

  -- Gera exatamente p_count O.S. novas nesta execução
  for v_i in 1..greatest(coalesce(p_count,20),1) loop
    -- seleção determinística usando OFFSET cíclico
    select id into v_cli
      from public.pessoas
     where empresa_id = v_emp
       and tipo in ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
     order by nome asc
     limit 1 offset ((v_i-1) % v_cli_count);

    select id into v_svc
      from public.servicos
     where empresa_id = v_emp
     order by descricao asc
     limit 1 offset ((v_i-1) % v_svc_count);

    select id into v_prd
      from public.produtos
     where empresa_id = v_emp
     order by nome asc
     limit 1 offset ((v_i-1) % v_prd_count);

    -- descrição única por batch
    v_desc := format('OS Seed %s - Exemplo %s', v_batch_id, v_i);

    -- cria cabeçalho
    insert into public.ordem_servicos (
      empresa_id, cliente_id, descricao, status, data_inicio, data_prevista
    ) values (
      v_emp,
      v_cli,
      v_desc,
      case (v_i % 4)
        when 0 then 'orcamento'::public.status_os
        when 1 then 'aberta'::public.status_os
        when 2 then 'concluida'::public.status_os
        else 'cancelada'::public.status_os
      end,
      (current_date - (v_i * interval '1 day'))::date,
      (current_date + (v_i * interval '1 day'))::date
    )
    returning id into v_os_id;

    -- itens via RPCs (recalcula totais)
    perform public.add_service_item_to_os_for_current_user(v_os_id, v_svc, 1, 0, false);
    perform public.add_product_item_to_os_for_current_user(v_os_id, v_prd, 1, 0, false);

    v_created_ids := array_append(v_created_ids, v_os_id);
  end loop;

  perform pg_notify('app_log', '[SEED] [OS] criadas ' || coalesce(array_length(v_created_ids,1),0)::text || ' O.S. (batch='||v_batch_id||')');

  -- retorna somente as O.S. criadas nesta execução
  return query
    select *
      from public.ordem_servicos
     where id = any(v_created_ids)
     order by created_at desc;
end;
$$;

-- Grants mínimos
revoke all on function public.seed_os_for_current_user(int) from public;
grant execute on function public.seed_os_for_current_user(int) to authenticated;
grant execute on function public.seed_os_for_current_user(int) to service_role;
