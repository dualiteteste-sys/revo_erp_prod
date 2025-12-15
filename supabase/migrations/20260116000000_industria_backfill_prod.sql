-- Backfill PROD: consolida migrações aplicadas manualmente (fora de ordem) em uma única migração
-- Motivo: Supabase CLI recusa aplicar migrações antigas antes do último versionamento já aplicado no PROD.
-- Esta migração é idempotente e deve ser aplicada após 20260115000000_recebimento_module.sql.

begin;

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------
-- Compat: alias industria_roteiro_etapas -> industria_roteiros_etapas
-- -------------------------------------------------------------------
drop view if exists public.industria_roteiro_etapas;
create view public.industria_roteiro_etapas as
select *
  from public.industria_roteiros_etapas;

comment on view public.industria_roteiro_etapas
  is 'Compat layer: mirror of industria_roteiros_etapas para funções legadas.';

-- Fix: geração de operações e QA reprocess (referência correta de etapas)
create or replace function public.industria_producao_gerar_operacoes(p_ordem_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_ordem record;
  v_exists boolean;
begin
  select produto_final_id, roteiro_aplicado_id, quantidade_planejada
    into v_ordem
    from public.industria_producao_ordens
   where id = p_ordem_id
     and empresa_id = v_empresa_id;

  if v_ordem.roteiro_aplicado_id is null then
    raise exception 'A ordem não possui um roteiro aplicado.';
  end if;

  select exists(
    select 1 from public.industria_producao_operacoes where ordem_id = p_ordem_id
  ) into v_exists;

  if v_exists then
    raise exception 'Operações já foram geradas para esta ordem.';
  end if;

  insert into public.industria_producao_operacoes (
    empresa_id,
    ordem_id,
    sequencia,
    centro_trabalho_id,
    centro_trabalho_nome,
    descricao,
    tempo_planejado_minutos,
    quantidade_planejada,
    status,
    permite_overlap,
    roteiro_etapa_id,
    require_ip,
    require_if
  )
  select
    v_empresa_id,
    p_ordem_id,
    e.sequencia,
    e.centro_trabalho_id,
    coalesce(ct.nome, 'Centro não definido') as centro_trabalho_nome,
    coalesce(nullif(e.observacoes, ''), 'Etapa ' || e.sequencia::text) as descricao,
    coalesce(e.tempo_setup_min, 0) + (coalesce(e.tempo_ciclo_min_por_unidade, 0) * v_ordem.quantidade_planejada),
    v_ordem.quantidade_planejada,
    'pendente',
    coalesce(e.permitir_overlap, false),
    e.id,
    coalesce(qa.require_ip, false),
    coalesce(qa.require_if, false)
  from public.industria_roteiros_etapas e
  left join public.industria_centros_trabalho ct on ct.id = e.centro_trabalho_id
  left join lateral (
    select
      bool_or(p.tipo = 'IP') as require_ip,
      bool_or(p.tipo = 'IF') as require_if
    from public.industria_qualidade_planos p
    where p.empresa_id = v_empresa_id
      and p.ativo = true
      and p.produto_id = v_ordem.produto_final_id
      and (
            (p.roteiro_etapa_id is not null and p.roteiro_etapa_id = e.id)
         or (p.roteiro_etapa_id is null and p.roteiro_id is not null and p.roteiro_id = e.roteiro_id)
         or (p.roteiro_etapa_id is null and p.roteiro_id is null)
      )
  ) qa on true
  where e.roteiro_id = v_ordem.roteiro_aplicado_id
    and e.empresa_id = v_empresa_id
  order by e.sequencia asc;

  update public.industria_producao_ordens
     set status = 'em_programacao'
   where id = p_ordem_id;
end;
$$;

create or replace function public.qualidade_reprocessar_operacoes_por_produto(p_produto_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  with operacoes_alvo as (
    select
      o.id as operacao_id,
      coalesce(bool_or(case when p.tipo = 'IP' then true end), false) as require_ip,
      coalesce(bool_or(case when p.tipo = 'IF' then true end), false) as require_if
    from public.industria_producao_operacoes o
    join public.industria_producao_ordens ord on ord.id = o.ordem_id
    left join public.industria_roteiros_etapas etapa on etapa.id = o.roteiro_etapa_id
    left join public.industria_qualidade_planos p
      on p.empresa_id = v_empresa_id
     and p.ativo = true
     and p.produto_id = ord.produto_final_id
     and (
            (p.roteiro_etapa_id is not null and p.roteiro_etapa_id = o.roteiro_etapa_id)
         or (p.roteiro_etapa_id is null and p.roteiro_id is not null and etapa.roteiro_id is not null and p.roteiro_id = etapa.roteiro_id)
         or (p.roteiro_etapa_id is null and p.roteiro_id is null)
        )
    where ord.produto_final_id = p_produto_id
      and ord.empresa_id = v_empresa_id
    group by o.id
  )
  update public.industria_producao_operacoes o
     set require_ip = operacoes_alvo.require_ip,
         require_if = operacoes_alvo.require_if,
         updated_at = now()
    from operacoes_alvo
   where o.id = operacoes_alvo.operacao_id;
end;
$$;

-- -------------------------------------------------------------------
-- Operadores (PIN/QR) + RPCs (gen_salt/crypt no schema extensions)
-- -------------------------------------------------------------------
create table if not exists public.industria_operadores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  nome text not null,
  email text,
  pin_hash text not null,
  centros_trabalho_ids uuid[] default '{}'::uuid[],
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_industria_operadores_empresa on public.industria_operadores(empresa_id);

alter table public.industria_operadores enable row level security;
drop policy if exists "operadores_empresa" on public.industria_operadores;
create policy "operadores_empresa" on public.industria_operadores
  using (empresa_id = public.current_empresa_id());

drop trigger if exists tg_operadores_updated_at on public.industria_operadores;
create trigger tg_operadores_updated_at
before update on public.industria_operadores
for each row execute function public.tg_set_updated_at();

create or replace function public.industria_operador_upsert(
  p_id uuid,
  p_nome text,
  p_email text,
  p_pin text,
  p_centros uuid[],
  p_ativo boolean
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_id uuid := p_id;
begin
  if v_id is null and p_pin is null then
    raise exception 'PIN é obrigatório';
  end if;

  if v_id is null then
    insert into public.industria_operadores (
      empresa_id, nome, email, pin_hash, centros_trabalho_ids, ativo
    ) values (
      public.current_empresa_id(),
      p_nome,
      p_email,
      extensions.crypt(p_pin, extensions.gen_salt('bf'::text)),
      coalesce(p_centros, '{}'::uuid[]),
      coalesce(p_ativo, true)
    )
    returning id into v_id;
  else
    update public.industria_operadores
       set nome = coalesce(p_nome, nome),
           email = coalesce(p_email, email),
           centros_trabalho_ids = coalesce(p_centros, centros_trabalho_ids),
           ativo = coalesce(p_ativo, ativo),
           pin_hash = case when p_pin is not null then extensions.crypt(p_pin, extensions.gen_salt('bf'::text)) else pin_hash end
     where id = v_id
       and empresa_id = public.current_empresa_id();
  end if;
  return v_id;
end;
$$;

create or replace function public.industria_operador_autenticar(
  p_pin text,
  p_nome text default null
) returns table (
  id uuid,
  nome text,
  email text,
  centros_trabalho_ids uuid[]
)
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  return query
  select o.id, o.nome, o.email, o.centros_trabalho_ids
    from public.industria_operadores o
   where o.empresa_id = public.current_empresa_id()
     and o.ativo = true
     and extensions.crypt(p_pin, o.pin_hash) = o.pin_hash
     and (
        p_nome is null
        or lower(o.nome) = lower(p_nome)
        or lower(o.nome) like '%' || lower(p_nome) || '%'
        or lower(coalesce(o.email, '')) = lower(p_nome)
        or lower(coalesce(o.email, '')) like '%' || lower(p_nome) || '%'
     )
   limit 1;
end;
$$;

create or replace function public.industria_operadores_list(p_search text default null)
returns table (
  id uuid,
  nome text,
  email text,
  centros_trabalho_ids uuid[],
  ativo boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select o.id, o.nome, o.email, o.centros_trabalho_ids, o.ativo, o.created_at
    from public.industria_operadores o
   where o.empresa_id = public.current_empresa_id()
     and (
        p_search is null
        or o.nome ilike '%'||p_search||'%'
        or coalesce(o.email, '') ilike '%'||p_search||'%'
     )
   order by o.nome asc, o.created_at desc;
$$;

create or replace function public.industria_operador_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.industria_operadores
   where id = p_id
     and empresa_id = public.current_empresa_id();
end;
$$;

grant execute on function public.industria_operador_upsert(uuid, text, text, text, uuid[], boolean) to authenticated, service_role;
grant execute on function public.industria_operador_autenticar(text, text) to authenticated, service_role;
grant execute on function public.industria_operadores_list(text) to authenticated, service_role;
grant execute on function public.industria_operador_delete(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------
-- Automação (regras por empresa) + acesso consolidado
-- -------------------------------------------------------------------
create table if not exists public.industria_automacao_regras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  chave text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_ind_automacao_empresa_chave
  on public.industria_automacao_regras(empresa_id, chave);

alter table public.industria_automacao_regras enable row level security;
drop policy if exists "ind_auto_select" on public.industria_automacao_regras;
create policy "ind_auto_select" on public.industria_automacao_regras
  for select using (empresa_id = public.current_empresa_id());
drop policy if exists "ind_auto_insert" on public.industria_automacao_regras;
create policy "ind_auto_insert" on public.industria_automacao_regras
  for insert with check (empresa_id = public.current_empresa_id());
drop policy if exists "ind_auto_update" on public.industria_automacao_regras;
create policy "ind_auto_update" on public.industria_automacao_regras
  for update using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
drop policy if exists "ind_auto_delete" on public.industria_automacao_regras;
create policy "ind_auto_delete" on public.industria_automacao_regras
  for delete using (empresa_id = public.current_empresa_id());

drop trigger if exists tg_ind_automacao_updated_at on public.industria_automacao_regras;
create trigger tg_ind_automacao_updated_at
before update on public.industria_automacao_regras
for each row execute function public.tg_set_updated_at();

create or replace function public.industria_automacao_upsert(
  p_chave text,
  p_enabled boolean,
  p_config jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.industria_automacao_regras (empresa_id, chave, enabled, config)
  values (public.current_empresa_id(), p_chave, coalesce(p_enabled, true), coalesce(p_config, '{}'::jsonb))
  on conflict (empresa_id, chave)
  do update set
    enabled = excluded.enabled,
    config = excluded.config,
    updated_at = now();
end;
$$;

create or replace function public.industria_automacao_list()
returns table (
  chave text,
  enabled boolean,
  config jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select r.chave, r.enabled, r.config, r.updated_at
    from public.industria_automacao_regras r
   where r.empresa_id = public.current_empresa_id()
   order by r.chave asc;
$$;

create or replace function public.industria_automacao_get()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_auto boolean := true;
  v_parada_min int := 20;
  v_refugo_percent numeric := 5;
  v_row record;
begin
  for v_row in
    select chave, enabled, config
      from public.industria_automacao_regras
     where empresa_id = v_emp
  loop
    if v_row.chave = 'auto_avancar' then
      v_auto := coalesce(v_row.enabled, v_auto);
    elsif v_row.chave = 'alerta_parada' then
      v_parada_min := coalesce((v_row.config->>'minutos')::int, v_parada_min);
    elsif v_row.chave = 'alerta_refugo' then
      v_refugo_percent := coalesce((v_row.config->>'percent')::numeric, v_refugo_percent);
    end if;
  end loop;

  return jsonb_build_object(
    'auto_avancar', v_auto,
    'alerta_parada_minutos', v_parada_min,
    'alerta_refugo_percent', v_refugo_percent
  );
end;
$$;

grant execute on function public.industria_automacao_upsert(text, boolean, jsonb) to authenticated, service_role;
grant execute on function public.industria_automacao_list() to authenticated, service_role;
grant execute on function public.industria_automacao_get() to authenticated, service_role;

-- -------------------------------------------------------------------
-- Operações (UI Chão/Operador) apontando para industria_producao_operacoes
-- -------------------------------------------------------------------
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
    'producao'::text as tipo_ordem,
    prod.nome as produto_nome,
    null::text as cliente_nome,
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
  where prd.empresa_id = v_emp
    and (p_centro_id is null or op.centro_trabalho_id = p_centro_id)
    and (p_status is null or case op.status when 'pendente' then 'liberada' else op.status end = p_status)
    and (p_search is null or prod.nome ilike '%'||p_search||'%' or prd.numero::text ilike '%'||p_search||'%')
  order by coalesce(prd.prioridade,0) desc, op.created_at desc;
end;
$$;

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
  quantidade_refugada numeric,
  updated_at timestamptz
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
    op.quantidade_planejada, op.quantidade_produzida, op.quantidade_refugo as quantidade_refugada,
    op.updated_at
  from public.industria_operacoes_list('lista', p_centro_trabalho_id, null, null) l
  join public.industria_producao_operacoes op on op.id = l.id
  where op.status not in ('cancelada')
  order by
    case when op.status = 'em_execucao' then 0 else 1 end,
    coalesce(l.prioridade,0) desc,
    op.created_at asc;
end;
$$;

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

create or replace function public.industria_operacao_replanejar(
  p_operacao_id uuid,
  p_novo_centro uuid,
  p_nova_prioridade int default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  update public.industria_producao_operacoes
     set centro_trabalho_id = coalesce(p_novo_centro, centro_trabalho_id),
         updated_at = now()
   where id = p_operacao_id
     and empresa_id = public.current_empresa_id();

  if p_nova_prioridade is not null then
    update public.industria_producao_ordens
       set prioridade = p_nova_prioridade
     where id = (select ordem_id from public.industria_producao_operacoes where id = p_operacao_id);
  end if;

  perform pg_notify('app_log', '[RPC] industria_operacao_replanejar op='||p_operacao_id||' ct='||p_novo_centro||' prio='||coalesce(p_nova_prioridade, -1));
end;
$$;

grant execute on function public.industria_operacoes_list(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.industria_operacoes_minha_fila(uuid) to authenticated, service_role;
grant execute on function public.industria_operacao_update_status(uuid, text, int, uuid) to authenticated, service_role;
grant execute on function public.industria_operacao_replanejar(uuid, uuid, int) to authenticated, service_role;

-- Apontamento com automação (auto-avança / bloqueio por refugo)
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
  v_auto_avancar boolean := true;
  v_refugo_percent numeric := 5;
  v_ordem_id uuid;
  v_sequencia int;
  v_planejada numeric;
  v_prod numeric;
  v_ref numeric;
  v_percent_refugo numeric;
  v_next_op uuid;
begin
  if not exists (select 1 from public.industria_producao_operacoes where id = p_operacao_id and empresa_id = v_emp) then
    raise exception 'Operação não encontrada.';
  end if;

  select ordem_id, sequencia, quantidade_planejada, quantidade_produzida, quantidade_refugo
    into v_ordem_id, v_sequencia, v_planejada, v_prod, v_ref
  from public.industria_producao_operacoes
  where id = p_operacao_id and empresa_id = v_emp;

  begin
    v_auto_avancar := coalesce((public.industria_automacao_get()->>'auto_avancar')::boolean, true);
  exception when others then
    v_auto_avancar := true;
  end;
  begin
    v_refugo_percent := coalesce((public.industria_automacao_get()->>'alerta_refugo_percent')::numeric, 5);
  exception when others then
    v_refugo_percent := 5;
  end;

  if p_acao = 'iniciar' then
    update public.industria_producao_operacoes
       set status = 'em_execucao',
           data_inicio_real = coalesce(data_inicio_real, now()),
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;

    update public.industria_producao_ordens
       set status = case when status in ('planejada','em_programacao') then 'em_producao' else status end,
           updated_at = now()
     where id = v_ordem_id and empresa_id = v_emp;

  elsif p_acao = 'pausar' then
    update public.industria_producao_operacoes
       set status = 'em_espera',
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

    insert into public.industria_producao_apontamentos (
      empresa_id, operacao_id, quantidade_boa, quantidade_refugo, motivo_refugo, observacoes, tipo
    ) values (
      v_emp, p_operacao_id, coalesce(p_qtd_boas,0), coalesce(p_qtd_refugadas,0), p_motivo_refugo, p_observacoes, 'conclusao'
    );

    select quantidade_planejada, quantidade_produzida, quantidade_refugo
      into v_planejada, v_prod, v_ref
    from public.industria_producao_operacoes
    where id = p_operacao_id and empresa_id = v_emp;

    if (v_prod + v_ref) > 0 then
      v_percent_refugo := round((v_ref / (v_prod + v_ref)) * 100, 2);
    else
      v_percent_refugo := 0;
    end if;

    if v_percent_refugo >= v_refugo_percent and v_refugo_percent > 0 then
      update public.industria_producao_operacoes
         set status = 'em_espera',
             updated_at = now()
       where id = p_operacao_id and empresa_id = v_emp;
    end if;

    if v_auto_avancar and (select status from public.industria_producao_operacoes where id = p_operacao_id) = 'concluida' then
      select id into v_next_op
        from public.industria_producao_operacoes
       where empresa_id = v_emp
         and ordem_id = v_ordem_id
         and sequencia > v_sequencia
         and status in ('na_fila', 'pendente')
       order by sequencia asc
       limit 1;

      if v_next_op is not null then
        update public.industria_producao_operacoes
           set status = 'pendente',
               updated_at = now()
         where id = v_next_op and empresa_id = v_emp;
      end if;

      if not exists (
        select 1 from public.industria_producao_operacoes
         where empresa_id = v_emp and ordem_id = v_ordem_id and status <> 'concluida'
      ) then
        update public.industria_producao_ordens
           set status = 'concluida',
               updated_at = now()
         where id = v_ordem_id and empresa_id = v_emp;
      end if;
    end if;
  else
    raise exception 'Ação inválida. Use iniciar|pausar|concluir.';
  end if;

  perform pg_notify('app_log', '[RPC] industria_operacao_apontar_execucao op='||p_operacao_id||' acao='||p_acao);
end;
$$;

grant execute on function public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text) to authenticated, service_role;

-- -------------------------------------------------------------------
-- Documentos/Instruções por operação (bucket + tabela + RPCs)
-- -------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('industria_operacao_docs', 'industria_operacao_docs', false)
on conflict (id) do nothing;

drop policy if exists "Read Industria Operacao Docs" on storage.objects;
create policy "Read Industria Operacao Docs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'industria_operacao_docs'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
    )
  )
);

drop policy if exists "Write Industria Operacao Docs" on storage.objects;
create policy "Write Industria Operacao Docs"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'industria_operacao_docs'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
    )
  )
);

drop policy if exists "Update Industria Operacao Docs" on storage.objects;
create policy "Update Industria Operacao Docs"
on storage.objects for update
to authenticated
using (
  bucket_id = 'industria_operacao_docs'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
    )
  )
);

drop policy if exists "Delete Industria Operacao Docs" on storage.objects;
create policy "Delete Industria Operacao Docs"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'industria_operacao_docs'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
    )
  )
);

create table if not exists public.industria_operacao_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  operacao_id uuid not null references public.industria_producao_operacoes(id) on delete cascade,
  titulo text not null,
  descricao text,
  arquivo_path text not null,
  mime_type text,
  tamanho_bytes bigint,
  versao integer not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default public.current_user_id()
);

create index if not exists idx_ind_op_docs_empresa_operacao on public.industria_operacao_documentos(empresa_id, operacao_id);
create index if not exists idx_ind_op_docs_operacao_titulo_versao on public.industria_operacao_documentos(operacao_id, titulo, versao desc);

alter table public.industria_operacao_documentos enable row level security;
drop policy if exists "ind_op_docs_select" on public.industria_operacao_documentos;
create policy "ind_op_docs_select" on public.industria_operacao_documentos
  for select using (empresa_id = public.current_empresa_id());
drop policy if exists "ind_op_docs_insert" on public.industria_operacao_documentos;
create policy "ind_op_docs_insert" on public.industria_operacao_documentos
  for insert with check (empresa_id = public.current_empresa_id());
drop policy if exists "ind_op_docs_update" on public.industria_operacao_documentos;
create policy "ind_op_docs_update" on public.industria_operacao_documentos
  for update using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
drop policy if exists "ind_op_docs_delete" on public.industria_operacao_documentos;
create policy "ind_op_docs_delete" on public.industria_operacao_documentos
  for delete using (empresa_id = public.current_empresa_id());

create or replace function public.industria_operacao_doc_register(
  p_operacao_id uuid,
  p_titulo text,
  p_descricao text,
  p_arquivo_path text,
  p_tamanho_bytes bigint default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_next int;
  v_id uuid;
begin
  select coalesce(max(d.versao), 0) + 1
    into v_next
  from public.industria_operacao_documentos d
  where d.empresa_id = v_emp
    and d.operacao_id = p_operacao_id
    and lower(d.titulo) = lower(p_titulo);

  insert into public.industria_operacao_documentos (
    empresa_id, operacao_id, titulo, descricao, arquivo_path, tamanho_bytes, versao, ativo
  ) values (
    v_emp, p_operacao_id, btrim(p_titulo), nullif(btrim(p_descricao),''), p_arquivo_path, p_tamanho_bytes, v_next, true
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.industria_operacao_docs_list(
  p_operacao_id uuid,
  p_only_latest boolean default true
) returns table (
  id uuid,
  operacao_id uuid,
  titulo text,
  descricao text,
  arquivo_path text,
  tamanho_bytes bigint,
  versao int,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with docs as (
    select d.*
      from public.industria_operacao_documentos d
     where d.empresa_id = public.current_empresa_id()
       and d.operacao_id = p_operacao_id
  ),
  ranked as (
    select d.*,
           row_number() over (partition by lower(d.titulo) order by d.versao desc, d.created_at desc) as rn
      from docs d
  )
  select r.id, r.operacao_id, r.titulo, r.descricao, r.arquivo_path, r.tamanho_bytes, r.versao, r.created_at
    from ranked r
   where (p_only_latest is false) or r.rn = 1
   order by r.titulo asc, r.versao desc, r.created_at desc;
$$;

create or replace function public.industria_operacao_doc_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  delete from public.industria_operacao_documentos d
   where d.id = p_id
     and d.empresa_id = public.current_empresa_id();
end;
$$;

grant execute on function public.industria_operacao_doc_register(uuid, text, text, text, bigint) to authenticated, service_role;
grant execute on function public.industria_operacao_docs_list(uuid, boolean) to authenticated, service_role;
grant execute on function public.industria_operacao_doc_delete(uuid) to authenticated, service_role;

commit;

