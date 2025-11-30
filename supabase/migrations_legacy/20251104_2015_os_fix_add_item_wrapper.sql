-- 20251104_2015_os_fix_add_item_wrapper.sql
-- Reescreve wrapper genérico para adição de item à OS
-- Logs: [RPC] [OS][ITEM][ADD] [PRODUCT|SERVICE]

create or replace function public.add_os_item_for_current_user(p_os_id uuid, p_payload jsonb)
returns public.ordem_servico_itens
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $fn$
declare
  v_emp uuid := public.current_empresa_id();
  v_os  uuid := p_os_id;
  v_kind text;               -- 'PRODUCT' | 'SERVICE'
  v_prod uuid;
  v_serv uuid;
  v_qtd numeric := 1;
  v_desc_pct numeric := 0;   -- em %
  v_orcar boolean := false;
  v_item public.ordem_servico_itens;
begin
  if v_emp is null then
    raise exception '[RPC][OS][ITEM][ADD] empresa_id inválido' using errcode='42501';
  end if;

  -- 1) Resolver OS id (aceita os dois formatos)
  if v_os is null then
    v_os := coalesce(
      nullif(p_payload->>'os_id','')::uuid,
      nullif(p_payload->>'ordem_servico_id','')::uuid
    );
  end if;
  if v_os is null then
    raise exception '[RPC][OS][ITEM][ADD] os_id ausente' using errcode='22023';
  end if;

  -- 2) Validar que a OS pertence à empresa atual (falha cedo)
  if not exists (
    select 1 from public.ordem_servicos
     where id = v_os and empresa_id = v_emp
  ) then
    raise exception '[RPC][OS][ITEM][ADD] OS fora da empresa atual' using errcode='42501';
  end if;

  -- 3) Detectar tipo (produto ou serviço)
  v_prod := nullif(p_payload->>'produto_id','')::uuid;
  v_serv := nullif(p_payload->>'servico_id','')::uuid;

  if v_prod is not null and v_serv is not null then
    raise exception '[RPC][OS][ITEM][ADD] payload ambíguo: produto_id e servico_id' using errcode='22023';
  elsif v_prod is not null then
    v_kind := 'PRODUCT';
  elsif v_serv is not null then
    v_kind := 'SERVICE';
  else
    raise exception '[RPC][OS][ITEM][ADD] payload sem produto_id/servico_id' using errcode='22023';
  end if;

  -- 4) Mapear quantidade (qtd | quantidade)
  v_qtd := coalesce(
    nullif(p_payload->>'quantidade','')::numeric,
    nullif(p_payload->>'qtd','')::numeric,
    1
  );
  if v_qtd is null or v_qtd <= 0 then
    v_qtd := 1;
  end if;

  -- 5) Mapear desconto (%)
  -- Preferência para 'desconto_pct'. Se vier 'desconto' sem '_pct', assume ser em %
  v_desc_pct := coalesce(
    nullif(p_payload->>'desconto_pct','')::numeric,
    nullif(p_payload->>'desconto','')::numeric,
    0
  );
  -- Normalização defensiva: percentuais fracionários (0..1) viram 0..100
  if v_desc_pct is not null and v_desc_pct between 0 and 1 then
    v_desc_pct := round(v_desc_pct * 100, 2);
  end if;
  if v_desc_pct < 0 then v_desc_pct := 0; end if;
  if v_desc_pct > 100 then v_desc_pct := 100; end if;

  -- 6) Mapear orçar
  v_orcar := coalesce(nullif(p_payload->>'orcar','')::boolean, false);

  -- 7) Roteamento para RPC específica
  if v_kind = 'PRODUCT' then
    v_item := public.add_product_item_to_os_for_current_user(v_os, v_prod, v_qtd, v_desc_pct, v_orcar);
    perform pg_notify('app_log', format('[RPC] [OS][ITEM][ADD] [PRODUCT] os=%s item=%s', v_os, v_item.id));
  else
    v_item := public.add_service_item_to_os_for_current_user(v_os, v_serv, v_qtd, v_desc_pct, v_orcar);
    perform pg_notify('app_log', format('[RPC] [OS][ITEM][ADD] [SERVICE] os=%s item=%s', v_os, v_item.id));
  end if;

  return v_item;
end;
$fn$;

-- Grants (mantém alinhado às demais RPCs)
do $$
begin
  grant execute on function public.add_os_item_for_current_user(uuid, jsonb) to authenticated;
  revoke execute on function public.add_os_item_for_current_user(uuid, jsonb) from anon;
exception when others then
  -- ignora se assinatura não existir anteriormente
  null;
end$$;
