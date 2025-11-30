-- 20251104_2125_os_add_item_overload_payload_only.sql
-- Overload para compatibilidade com chamadas de 1 parâmetro (payload jsonb)
-- Logs: [RPC] [OS][ITEM][ADD][OVERLOAD]

create or replace function public.add_os_item_for_current_user(payload jsonb)
returns public.ordem_servico_itens
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $fn$
declare
  v_os uuid;
begin
  -- aceita os dois nomes legados
  v_os := coalesce(
    nullif(payload->>'os_id','')::uuid,
    nullif(payload->>'ordem_servico_id','')::uuid
  );

  if v_os is null then
    raise exception '[RPC][OS][ITEM][ADD][OVERLOAD] os_id ausente no payload' using errcode='22023';
  end if;

  -- delega para a função oficial (uuid, jsonb)
  return public.add_os_item_for_current_user(v_os, payload);
end;
$fn$;

-- Grants coerentes (auth pode executar; anon não)
do $$
begin
  grant execute on function public.add_os_item_for_current_user(jsonb) to authenticated;
  revoke execute on function public.add_os_item_for_current_user(jsonb) from anon;
exception when others then
  null;
end$$;

-- Força reload imediato do schema cache do PostgREST (evita aguardar)
-- Obs.: requer permissão para NOTIFY no canal pgrst (no Supabase padrão, ok)
select pg_notify('pgrst', 'reload schema');
