-- 20251103_050000_os_status_flow.sql
-- Fluxo de status da OS + validações básicas
-- Logs: [RPC] [OS][STATUS]

create or replace function public.os_set_status_for_current_user(
  p_os_id uuid,
  p_next  public.status_os,
  p_opts  jsonb default '{}'::jsonb   -- { "force": false }
)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp  uuid := public.current_empresa_id();
  v_os   public.ordem_servicos;
  v_cnt  int;
  v_force boolean := coalesce((p_opts->>'force')::boolean, false);
begin
  if v_emp is null then
    raise exception '[RPC][OS][STATUS] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_os
  from public.ordem_servicos
  where id = p_os_id and empresa_id = v_emp;

  if not found then
    raise exception '[RPC][OS][STATUS] OS não encontrada' using errcode='P0002';
  end if;

  -- Regras de transição
  if v_os.status = 'orcamento' then
    if p_next not in ('aberta','cancelada') then
      raise exception '[RPC][OS][STATUS] transição inválida: orcamento -> %', p_next using errcode='22023';
    end if;
  elsif v_os.status = 'aberta' then
    if p_next not in ('concluida','cancelada') then
      raise exception '[RPC][OS][STATUS] transição inválida: aberta -> %', p_next using errcode='22023';
    end if;
  else
    -- concluida/cancelada são estados finais
    raise exception '[RPC][OS][STATUS] OS em estado final (%). Não é possível alterar.', v_os.status using errcode='22023';
  end if;

  -- Pré-condições: precisa ter pelo menos 1 item para abrir/concluir
  if p_next in ('aberta','concluida') and not v_force then
    select count(*) into v_cnt
    from public.ordem_servico_itens
    where ordem_servico_id = v_os.id and empresa_id = v_emp;
    if coalesce(v_cnt,0) = 0 then
      raise exception '[RPC][OS][STATUS] OS sem itens. Adicione itens antes de mudar para %', p_next using errcode='23514';
    end if;
  end if;

  -- Aplicar alterações e datas padrão
  update public.ordem_servicos
     set status         = p_next,
         data_inicio    = case when p_next = 'aberta'     and data_inicio    is null then current_date else data_inicio end,
         data_conclusao = case when p_next = 'concluida'  and data_conclusao is null then current_date else data_conclusao end
   where id = v_os.id
     and empresa_id = v_emp
  returning * into v_os;

  -- Recalcular totais sempre
  perform public.os_recalc_totals(v_os.id);

  perform pg_notify('app_log', '[RPC] [OS][STATUS] ' || v_os.id::text || ' -> ' || p_next::text);
  return v_os;
end;
$$;

revoke all on function public.os_set_status_for_current_user(uuid, public.status_os, jsonb) from public;
grant execute on function public.os_set_status_for_current_user(uuid, public.status_os, jsonb) to authenticated;
grant execute on function public.os_set_status_for_current_user(uuid, public.status_os, jsonb) to service_role;
