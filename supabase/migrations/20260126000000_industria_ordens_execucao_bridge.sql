/*
  # Indústria - Bridge OP/OB -> Execução (operações)

  Objetivo:
  - Permitir que ordens do módulo unificado (industria_ordens / OP-OB) gerem operações
    no módulo de Execução (industria_producao_*), fechando o loop até Chão/Tela do Operador.

  Estratégia:
  - Persistir vínculo do roteiro aplicado na OP/OB (roteiro_aplicado_id/desc).
  - Persistir vínculo do "espelho" de execução (execucao_ordem_id).
  - RPC `industria_ordem_gerar_execucao` cria uma industria_producao_ordens espelhada,
    copia componentes e chama `industria_producao_gerar_operacoes`.
  - Ajusta `industria_operacoes_list` para enriquecer tipo/cliente via industria_ordens.
*/

begin;

-- 1) Colunas no módulo unificado (OP/OB)
alter table public.industria_ordens
  add column if not exists roteiro_aplicado_id uuid,
  add column if not exists roteiro_aplicado_desc text,
  add column if not exists execucao_ordem_id uuid,
  add column if not exists execucao_gerada_em timestamptz;

create index if not exists idx_industria_ordens_execucao_ordem_id
  on public.industria_ordens(execucao_ordem_id);

do $$
begin
  if to_regclass('public.industria_producao_ordens') is not null then
    begin
      alter table public.industria_ordens
        add constraint industria_ordens_execucao_ordem_fkey
        foreign key (execucao_ordem_id) references public.industria_producao_ordens(id);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- 2) Atualiza RPC de detalhes para incluir vínculo de execução e roteiro (mantém assinatura)
create or replace function public.industria_get_ordem_details(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id  uuid := public.current_empresa_id();
  v_ordem       jsonb;
  v_componentes jsonb;
  v_entregas    jsonb;
begin
  select
    to_jsonb(o.*)
    || jsonb_build_object(
         'produto_nome', p.nome,
         'cliente_nome', c.nome,
         'material_cliente_nome', mc.nome_cliente,
         'material_cliente_codigo', mc.codigo_cliente,
         'material_cliente_unidade', mc.unidade,
         'execucao_ordem_numero', prd.numero
       )
  into v_ordem
  from public.industria_ordens o
  join public.produtos p
    on o.produto_final_id = p.id
  left join public.pessoas c
    on o.cliente_id = c.id
  left join public.industria_materiais_cliente mc
    on mc.id = o.material_cliente_id
   and mc.empresa_id = v_empresa_id
  left join public.industria_producao_ordens prd
    on prd.id = o.execucao_ordem_id
   and prd.empresa_id = v_empresa_id
  where o.id = p_id
    and o.empresa_id = v_empresa_id;

  if v_ordem is null then
    return null;
  end if;

  select jsonb_agg(
           to_jsonb(comp.*)
           || jsonb_build_object('produto_nome', p2.nome)
         )
  into v_componentes
  from public.industria_ordens_componentes comp
  join public.produtos p2
    on comp.produto_id = p2.id
  where comp.ordem_id = p_id
    and comp.empresa_id = v_empresa_id;

  select jsonb_agg(
           to_jsonb(ent.*)
           order by ent.data_entrega desc, ent.created_at desc
         )
  into v_entregas
  from public.industria_ordens_entregas ent
  where ent.ordem_id = p_id
    and ent.empresa_id = v_empresa_id;

  return v_ordem
         || jsonb_build_object(
              'componentes', coalesce(v_componentes, '[]'::jsonb),
              'entregas',    coalesce(v_entregas,    '[]'::jsonb)
            );
end;
$$;

revoke all on function public.industria_get_ordem_details from public;
grant execute on function public.industria_get_ordem_details to authenticated, service_role;

-- 3) Atualiza RPC de upsert do módulo unificado para persistir roteiro/execução (mantém assinatura)
create or replace function public.industria_upsert_ordem(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id         uuid;
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_payload->>'id' is not null then
    update public.industria_ordens
    set
      tipo_ordem            = p_payload->>'tipo_ordem',
      produto_final_id      = (p_payload->>'produto_final_id')::uuid,
      quantidade_planejada  = (p_payload->>'quantidade_planejada')::numeric,
      unidade               = p_payload->>'unidade',
      cliente_id            = (p_payload->>'cliente_id')::uuid,
      status                = coalesce(p_payload->>'status', 'rascunho'),
      prioridade            = coalesce((p_payload->>'prioridade')::int, 0),
      data_prevista_inicio  = (p_payload->>'data_prevista_inicio')::date,
      data_prevista_fim     = (p_payload->>'data_prevista_fim')::date,
      data_prevista_entrega = (p_payload->>'data_prevista_entrega')::date,
      documento_ref         = p_payload->>'documento_ref',
      observacoes           = p_payload->>'observacoes',
      usa_material_cliente  = coalesce((p_payload->>'usa_material_cliente')::boolean, false),
      material_cliente_id   = (p_payload->>'material_cliente_id')::uuid,
      roteiro_aplicado_id   = (p_payload->>'roteiro_aplicado_id')::uuid,
      roteiro_aplicado_desc = p_payload->>'roteiro_aplicado_desc'
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_ordens (
      empresa_id,
      tipo_ordem,
      produto_final_id,
      quantidade_planejada,
      unidade,
      cliente_id,
      status,
      prioridade,
      data_prevista_inicio,
      data_prevista_fim,
      data_prevista_entrega,
      documento_ref,
      observacoes,
      usa_material_cliente,
      material_cliente_id,
      roteiro_aplicado_id,
      roteiro_aplicado_desc
    ) values (
      v_empresa_id,
      p_payload->>'tipo_ordem',
      (p_payload->>'produto_final_id')::uuid,
      (p_payload->>'quantidade_planejada')::numeric,
      p_payload->>'unidade',
      (p_payload->>'cliente_id')::uuid,
      coalesce(p_payload->>'status', 'rascunho'),
      coalesce((p_payload->>'prioridade')::int, 0),
      (p_payload->>'data_prevista_inicio')::date,
      (p_payload->>'data_prevista_fim')::date,
      (p_payload->>'data_prevista_entrega')::date,
      p_payload->>'documento_ref',
      p_payload->>'observacoes',
      coalesce((p_payload->>'usa_material_cliente')::boolean, false),
      (p_payload->>'material_cliente_id')::uuid,
      (p_payload->>'roteiro_aplicado_id')::uuid,
      p_payload->>'roteiro_aplicado_desc'
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] industria_upsert_ordem: ' || v_id);
  return public.industria_get_ordem_details(v_id);
end;
$$;

revoke all on function public.industria_upsert_ordem from public;
grant execute on function public.industria_upsert_ordem to authenticated, service_role;

-- 4) Bridge: cria a ordem de execução e gera operações
create or replace function public.industria_ordem_gerar_execucao(
  p_ordem_id uuid,
  p_roteiro_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_ord record;
  v_prod_ordem_id uuid;
  v_rot_id uuid;
  v_rot record;
  v_tipo_bom text;
  v_rot_desc text;
  v_ops_count int;
begin
  if to_regclass('public.industria_producao_ordens') is null then
    raise exception 'Módulo de Execução/Produção não está disponível (industria_producao_ordens não existe).';
  end if;
  if to_regclass('public.industria_producao_operacoes') is null then
    raise exception 'Módulo de Execução/Produção não está disponível (industria_producao_operacoes não existe).';
  end if;

  select *
    into v_ord
    from public.industria_ordens
   where id = p_ordem_id
     and empresa_id = v_empresa_id;

  if v_ord.id is null then
    raise exception 'Ordem não encontrada ou acesso negado.';
  end if;

  -- Já existe vínculo de execução: garante operações e retorna
  if v_ord.execucao_ordem_id is not null then
    v_prod_ordem_id := v_ord.execucao_ordem_id;
    if not exists (select 1 from public.industria_producao_operacoes where ordem_id = v_prod_ordem_id) then
      perform public.industria_producao_gerar_operacoes(v_prod_ordem_id);
    end if;
    select count(*)::int into v_ops_count from public.industria_producao_operacoes where ordem_id = v_prod_ordem_id;
    return jsonb_build_object(
      'producao_ordem_id', v_prod_ordem_id,
      'producao_ordem_numero', (select numero from public.industria_producao_ordens where id = v_prod_ordem_id),
      'operacoes', v_ops_count
    );
  end if;

  v_tipo_bom := case when v_ord.tipo_ordem = 'beneficiamento' then 'beneficiamento' else 'producao' end;
  v_rot_id := coalesce(p_roteiro_id, v_ord.roteiro_aplicado_id);

  if v_rot_id is null then
    select r.id, r.codigo, r.descricao, r.versao
      into v_rot
      from public.industria_roteiros r
     where r.empresa_id = v_empresa_id
       and r.produto_id = v_ord.produto_final_id
       and r.tipo_bom = v_tipo_bom
       and r.ativo = true
     order by
       (case when v_tipo_bom = 'beneficiamento' then r.padrao_para_beneficiamento else r.padrao_para_producao end) desc,
       r.versao desc,
       r.created_at desc
     limit 1;

    v_rot_id := v_rot.id;
  else
    select r.id, r.codigo, r.descricao, r.versao
      into v_rot
      from public.industria_roteiros r
     where r.empresa_id = v_empresa_id
       and r.id = v_rot_id
       and r.ativo = true;
  end if;

  if v_rot.id is null then
    raise exception 'Nenhum roteiro ativo encontrado para este produto (%), tipo %.', v_ord.produto_final_id, v_tipo_bom;
  end if;

  v_rot_desc :=
    trim(both ' ' from
      coalesce(v_rot.codigo, '')
      || case when v_rot.versao is not null then ' (v' || v_rot.versao::text || ')' else '' end
      || case when v_rot.descricao is not null and v_rot.descricao <> '' then ' - ' || v_rot.descricao else '' end
    );

  -- Cria ordem espelhada para Execução
  insert into public.industria_producao_ordens (
    empresa_id,
    origem_ordem,
    produto_final_id,
    quantidade_planejada,
    unidade,
    status,
    prioridade,
    data_prevista_inicio,
    data_prevista_fim,
    data_prevista_entrega,
    documento_ref,
    observacoes,
    roteiro_aplicado_id,
    roteiro_aplicado_desc
  ) values (
    v_empresa_id,
    'manual',
    v_ord.produto_final_id,
    v_ord.quantidade_planejada,
    v_ord.unidade,
    case when v_ord.status in ('concluida','cancelada') then v_ord.status else 'planejada' end,
    coalesce(v_ord.prioridade, 0),
    v_ord.data_prevista_inicio,
    v_ord.data_prevista_fim,
    v_ord.data_prevista_entrega,
    coalesce(
      nullif(v_ord.documento_ref, ''),
      (case when v_ord.tipo_ordem = 'beneficiamento' then 'OB' else 'OP' end) || '-' || v_ord.numero::text
    ),
    v_ord.observacoes,
    v_rot_id,
    nullif(v_rot_desc, '')
  )
  returning id into v_prod_ordem_id;

  -- Copia componentes (mínimo comum entre schemas)
  insert into public.industria_producao_componentes (
    empresa_id,
    ordem_id,
    produto_id,
    quantidade_planejada,
    unidade
  )
  select
    v_empresa_id,
    v_prod_ordem_id,
    c.produto_id,
    c.quantidade_planejada,
    c.unidade
  from public.industria_ordens_componentes c
  where c.empresa_id = v_empresa_id
    and c.ordem_id = p_ordem_id;

  -- Gera operações
  perform public.industria_producao_gerar_operacoes(v_prod_ordem_id);
  select count(*)::int into v_ops_count from public.industria_producao_operacoes where ordem_id = v_prod_ordem_id;

  update public.industria_ordens
     set execucao_ordem_id = v_prod_ordem_id,
         execucao_gerada_em = now(),
         roteiro_aplicado_id = v_rot_id,
         roteiro_aplicado_desc = nullif(v_rot_desc, '')
   where id = p_ordem_id
     and empresa_id = v_empresa_id;

  perform pg_notify('app_log', '[RPC] industria_ordem_gerar_execucao: ordem=' || p_ordem_id || ' prod=' || v_prod_ordem_id);

  return jsonb_build_object(
    'producao_ordem_id', v_prod_ordem_id,
    'producao_ordem_numero', (select numero from public.industria_producao_ordens where id = v_prod_ordem_id),
    'operacoes', v_ops_count
  );
end;
$$;

revoke all on function public.industria_ordem_gerar_execucao from public;
grant execute on function public.industria_ordem_gerar_execucao to authenticated, service_role;

-- 5) Enriquecer lista de operações com tipo/cliente via indústria_ordens (mantém assinatura)
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
  atrasada boolean,
  updated_at timestamptz
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
    case
      when iord.tipo_ordem = 'beneficiamento' then 'beneficiamento'::text
      else 'producao'::text
    end as tipo_ordem,
    prod.nome as produto_nome,
    cli.nome as cliente_nome,
    op.centro_trabalho_id,
    ct.nome as centro_trabalho_nome,
    case op.status when 'pendente' then 'liberada' else op.status end as status,
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
    end as atrasada,
    op.updated_at
  from public.industria_producao_operacoes op
  join public.industria_producao_ordens prd on prd.id = op.ordem_id
  left join public.industria_centros_trabalho ct on ct.id = op.centro_trabalho_id
  join public.produtos prod on prod.id = prd.produto_final_id
  left join public.industria_ordens iord
    on iord.execucao_ordem_id = prd.id
   and iord.empresa_id = v_emp
  left join public.pessoas cli
    on cli.id = iord.cliente_id
  where prd.empresa_id = v_emp
    and (p_centro_id is null or op.centro_trabalho_id = p_centro_id)
    and (p_status is null or case op.status when 'pendente' then 'liberada' else op.status end = p_status)
    and (
      p_search is null
      or prod.nome ilike '%'||p_search||'%'
      or coalesce(prd.numero::text, '') ilike '%'||p_search||'%'
      or coalesce(prd.documento_ref, '') ilike '%'||p_search||'%'
      or coalesce(cli.nome, '') ilike '%'||p_search||'%'
      or coalesce(iord.numero::text, '') ilike '%'||p_search||'%'
    )
  order by coalesce(prd.prioridade,0) desc, op.created_at desc;
end;
$$;

grant execute on function public.industria_operacoes_list(text, uuid, text, text) to authenticated, service_role;

commit;
