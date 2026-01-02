/*
  Roadmap/UX: permitir validar PDV sem SELECT direto na tabela (RLS)
  - RPC security definer: conta pedidos por canal (ex.: 'pdv')
*/

begin;

create or replace function public.vendas_count_pedidos_by_canal(
  p_canal text default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_cnt bigint;
begin
  select count(*)
    into v_cnt
  from public.vendas_pedidos p
  where p.empresa_id = v_empresa
    and (p_canal is null or p.canal = p_canal);

  return v_cnt;
end;
$$;

revoke all on function public.vendas_count_pedidos_by_canal(text) from public;
grant execute on function public.vendas_count_pedidos_by_canal(text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

commit;

