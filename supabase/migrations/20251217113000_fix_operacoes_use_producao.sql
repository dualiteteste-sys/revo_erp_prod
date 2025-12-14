-- Reaponta RPCs de operações para industria_producao_operacoes
begin;

create extension if not exists pgcrypto;

drop function if exists public.industria_operacoes_minha_fila(uuid);
drop function if exists public.industria_operacoes_list(text, uuid, text, text);
drop function if exists public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text);

drop function if exists public.industria_operacoes_list;
drop function if exists public.industria_operacoes_minha_fila;

drop function if exists public.industria_operacao_update_status(uuid, text, int, uuid);

-- Lista
create or replace function public.industria_operacoes_list(
  p_view text default 'lista',
  p_centro_id uuid default null,
  p_status text default null,
  p_search text default null
) returns table (
  id uuid,
  ordem_id uuid,
  ordem_numero bigint,
  tipo_ordem text,
  produto_nome text,
  cliente_nome text,
  centro_trabalho_id uuid,
  centro_trabalho_nome text,
  status text,
  prioridade int,
  data_prevista_inicio timestamptz,
  data_prevista_fim timestamptz,
  percentual_concluido numeric,
  atrasada boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  return query
  select
    op.id,
    op.ordem_id,
    prd.numero::bigint as ordem_numero,
    'producao'::text as tipo_ordem,
    prod.nome as produto_nome,
    null::text as cliente_nome,
    op.centro_trabalho_id,
    ct.nome as centro_trabalho_nome,
    case op.status
      when 'pendente' then 'liberada'
      else op.status
    end as status,
    coalesce(prd.prioridade, 0) as prioridade,
    prd.data_prevista_inicio::timestamptz,
    prd.data_prevista_fim::timestamptz,
    case when op.quantidade_planejada > 0
         then round((op.quantidade_produzida / op.quantidade_planejada) * 100, 2)
         else 0 end as percentual_concluido,
    case 
      when (op.status not in ('concluida', 'cancelada'))
       and prd.data_prevista_fim is not null
       and prd.data_prevista_fim < now()
      then true else false
    end as atrasada
  from public.industria_producao_operacoes op
  join public.industria_producao_ordens prd on prd.id = op.ordem_id
  left join public.industria_centros_trabalho ct on ct.id = op.centro_trabalho_id
  join public.produtos prod on prod.id = prd.produto_final_id
  where prd.empresa_id = v_emp
    and (p_centro_id is null or op.centro_trabalho_id = p_centro_id)
    and (p_status is null or case op.status when 'pendente' then 'liberada' else op.status end = p_status)
    and (p_search is null or prod.nome ilike '%'||p_search||'%' or prd.numero::text ilike '%'||p_search||'%')
  order by coalesce(prd.prioridade,0) desc, op.created_at desc;
end;
$$;

-- Minha fila
create or replace function public.industria_operacoes_minha_fila(
  p_centro_trabalho_id uuid
) returns table (
  id uuid,
  ordem_id uuid,
  ordem_numero bigint,
  tipo_ordem text,
  produto_nome text,
  cliente_nome text,
  centro_trabalho_id uuid,
  centro_trabalho_nome text,
  status text,
  prioridade int,
  data_prevista_inicio timestamptz,
  data_prevista_fim timestamptz,
  percentual_concluido numeric,
  atrasada boolean,
  quantidade_planejada numeric,
  quantidade_produzida numeric,
  quantidade_refugada numeric
)
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  return query
  select
    l.id, l.ordem_id, l.ordem_numero, l.tipo_ordem, l.produto_nome, l.cliente_nome,
    l.centro_trabalho_id, l.centro_trabalho_nome, l.status, l.prioridade,
    l.data_prevista_inicio, l.data_prevista_fim, l.percentual_concluido, l.atrasada,
    op.quantidade_planejada, op.quantidade_produzida, op.quantidade_refugo as quantidade_refugada
  from public.industria_operacoes_list('lista', p_centro_trabalho_id, null, null) l
  join public.industria_producao_operacoes op on op.id = l.id
  join public.industria_producao_ordens prd on prd.id = op.ordem_id
  where op.status not in ('cancelada')
  order by 
    case when op.status = 'em_execucao' then 0 else 1 end,
    coalesce(prd.prioridade,0) desc,
    op.created_at asc;
end;
$$;

-- Apontamento
create or replace function public.industria_operacao_apontar_execucao(
  p_operacao_id uuid,
  p_acao text, -- 'iniciar' | 'pausar' | 'concluir'
  p_qtd_boas numeric default 0,
  p_qtd_refugadas numeric default 0,
  p_motivo_refugo text default null,
  p_observacoes text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if not exists (select 1 from public.industria_producao_operacoes where id = p_operacao_id and empresa_id = v_emp) then
    raise exception 'Operação não encontrada.';
  end if;

  if p_acao = 'iniciar' then
    update public.industria_producao_operacoes
       set status = 'em_execucao',
           data_inicio_real = coalesce(data_inicio_real, now()),
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;

  elsif p_acao = 'pausar' then
    update public.industria_producao_operacoes
       set status = 'pendente',
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;

  elsif p_acao = 'concluir' then
    update public.industria_producao_operacoes
       set quantidade_produzida = quantidade_produzida + coalesce(p_qtd_boas,0),
           quantidade_refugo    = quantidade_refugo    + coalesce(p_qtd_refugadas,0),
           status = case when (quantidade_produzida + coalesce(p_qtd_boas,0)) >= quantidade_planejada
                         then 'concluida' else 'pendente' end,
           data_fim_real = case when (quantidade_produzida + coalesce(p_qtd_boas,0)) >= quantidade_planejada
                         then now() else data_fim_real end,
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;
  else
    raise exception 'Ação inválida. Use iniciar|pausar|concluir.';
  end if;

  insert into public.industria_producao_apontamentos (
    empresa_id, operacao_id, quantidade_boa, quantidade_refugo, motivo_refugo, observacoes, tipo
  ) values (
    v_emp, p_operacao_id, coalesce(p_qtd_boas,0), coalesce(p_qtd_refugadas,0), p_motivo_refugo, p_observacoes,
    case when p_acao = 'concluir' then 'conclusao' else 'producao' end
  );

  perform pg_notify('app_log', '[RPC] industria_operacao_apontar_execucao op='||p_operacao_id||' acao='||p_acao);
end;
$$;

-- Atualização de status (simplificada para producao)
create or replace function public.industria_operacao_update_status(
  p_id uuid,
  p_status text,
  p_prioridade int default null,
  p_centro_trabalho_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  update public.industria_producao_operacoes
     set status = p_status,
         centro_trabalho_id = coalesce(p_centro_trabalho_id, centro_trabalho_id),
         updated_at = now()
   where id = p_id
     and empresa_id = v_emp;

  if p_prioridade is not null then
    update public.industria_producao_ordens
       set prioridade = p_prioridade
     where id = (select ordem_id from public.industria_producao_operacoes where id = p_id);
  end if;

  perform pg_notify('app_log', '[RPC] industria_operacao_update_status id='||p_id||' status='||p_status);
end;
$$;

grant execute on function public.industria_operacoes_list(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.industria_operacoes_minha_fila(uuid) to authenticated, service_role;
grant execute on function public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text) to authenticated, service_role;
grant execute on function public.industria_operacao_update_status(uuid, text, int, uuid) to authenticated, service_role;

commit;
