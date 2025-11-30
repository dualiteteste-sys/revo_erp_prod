-- =========================================================
-- Indústria – Dashboard & Execução (compat + MT hardening)
-- =========================================================
set search_path = pg_catalog, public;

-- ---------------------------------------------------------
-- 0) Stubs mínimos (agora com coluna status em produção)
-- ---------------------------------------------------------
create table if not exists public.industria_producao_ordens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  cliente_id uuid,
  numero bigint,
  status text default 'planejada',          -- &lt;== necessário para o dashboard
  data_prevista_inicio timestamptz,
  data_prevista_fim timestamptz
);

create table if not exists public.industria_centros_trabalho (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null
);

-- ---------------------------------------------------------
-- 1) Dashboard Stats (try/catch p/ ambientes parciais)
-- ---------------------------------------------------------
create or replace function public.industria_get_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_res jsonb;
begin
  begin
    with prod_stats as (
      select status, count(*) as total
      from public.industria_producao_ordens
      where empresa_id = v_emp
      group by status
    ),
    benef_stats as (
      select status, count(*) as total
      from public.industria_benef_ordens
      where empresa_id = v_emp
      group by status
    )
    select jsonb_build_object(
      'producao_status', (select coalesce(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb) from prod_stats p),
      'beneficiamento_status', (select coalesce(jsonb_agg(to_jsonb(b.*)), '[]'::jsonb) from benef_stats b),
      'total_producao', (select coalesce(sum(total), 0) from prod_stats),
      'total_beneficiamento', (select coalesce(sum(total), 0) from benef_stats),
      'gaps_identificados', 0,
      'treinamentos_concluidos', 0,
      'investimento_treinamento', 0,
      'top_gaps', '[]'::jsonb,
      'status_treinamentos', '[]'::jsonb
    ) into v_res;
    return v_res;
  exception when undefined_table then
    return jsonb_build_object(
      'producao_status', '[]'::jsonb,
      'beneficiamento_status', '[]'::jsonb,
      'total_producao', 0,
      'total_beneficiamento', 0
    );
  end;
end;
$$;
revoke all on function public.industria_get_dashboard_stats() from public;
grant  execute on function public.industria_get_dashboard_stats() to authenticated, service_role;

-- ---------------------------------------------------------
-- 2) Tabela industria_operacoes (+ trigger/índices, FKs condicionais)
-- ---------------------------------------------------------
create table if not exists public.industria_operacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  ordem_producao_id uuid,
  ordem_beneficiamento_id uuid,
  centro_trabalho_id uuid not null,
  produto_id uuid not null,
  sequencia int not null default 10,
  status text not null default 'planejada',
  quantidade_planejada numeric not null default 0,
  quantidade_produzida numeric not null default 0,
  quantidade_refugada numeric not null default 0,
  data_inicio_real timestamptz,
  data_fim_real timestamptz,
  prioridade int default 0,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint ind_operacoes_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint ind_operacoes_origem_check check (ordem_producao_id is not null or ordem_beneficiamento_id is not null)
);

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'handle_updated_at_industria_operacoes'
       and tgrelid = 'public.industria_operacoes'::regclass
  ) then
    create trigger handle_updated_at_industria_operacoes
      before update on public.industria_operacoes
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

create index if not exists idx_ind_operacoes_empresa on public.industria_operacoes(empresa_id);
create index if not exists idx_ind_operacoes_centro on public.industria_operacoes(empresa_id, centro_trabalho_id, status);

do $$
begin
  if exists (select 1 from pg_class where relname='industria_benef_ordens') then
    if not exists (select 1 from pg_constraint where conname='ind_operacoes_benef_fkey') then
      alter table public.industria_operacoes
        add constraint ind_operacoes_benef_fkey
        foreign key (ordem_beneficiamento_id) references public.industria_benef_ordens(id) on delete cascade;
    end if;
  end if;

  if exists (select 1 from pg_class where relname='industria_producao_ordens') then
    if not exists (select 1 from pg_constraint where conname='ind_operacoes_prod_fkey') then
      alter table public.industria_operacoes
        add constraint ind_operacoes_prod_fkey
        foreign key (ordem_producao_id) references public.industria_producao_ordens(id) on delete cascade;
    end if;
  end if;

  if exists (select 1 from pg_class where relname='industria_centros_trabalho') then
    if not exists (select 1 from pg_constraint where conname='ind_operacoes_centro_fkey') then
      alter table public.industria_operacoes
        add constraint ind_operacoes_centro_fkey
        foreign key (centro_trabalho_id) references public.industria_centros_trabalho(id);
    end if;
  end if;

  if exists (select 1 from pg_class where relname='produtos') then
    if not exists (select 1 from pg_constraint where conname='ind_operacoes_produto_fkey') then
      alter table public.industria_operacoes
        add constraint ind_operacoes_produto_fkey
        foreign key (produto_id) references public.produtos(id);
    end if;
  end if;
end;
$$;

alter table public.industria_operacoes enable row level security;

drop policy if exists "ind_operacoes_select" on public.industria_operacoes;
drop policy if exists "ind_operacoes_insert" on public.industria_operacoes;
drop policy if exists "ind_operacoes_update" on public.industria_operacoes;
drop policy if exists "ind_operacoes_delete" on public.industria_operacoes;

create policy "ind_operacoes_select"
  on public.industria_operacoes for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_operacoes_insert"
  on public.industria_operacoes for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_operacoes_update"
  on public.industria_operacoes for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_operacoes_delete"
  on public.industria_operacoes for delete
  using (empresa_id = public.current_empresa_id());

-- ---------------------------------------------------------
-- 3) RPCs (list, minha_fila, apontamento, update_status)
-- ---------------------------------------------------------
create or replace function public.industria_operacoes_list(
  p_view text default 'lista',
  p_centro_id uuid default null,
  p_status text default null,
  p_search text default null
)
returns table (
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
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  return query
  select
    op.id,
    coalesce(op.ordem_producao_id, op.ordem_beneficiamento_id) as ordem_id,
    coalesce(prod.numero, benef.numero) as ordem_numero,
    case when op.ordem_producao_id is not null then 'producao' else 'beneficiamento' end as tipo_ordem,
    p.nome as produto_nome,
    coalesce(cli_prod.nome, cli_benef.nome) as cliente_nome,
    op.centro_trabalho_id,
    ct.nome as centro_trabalho_nome,
    op.status,
    op.prioridade,
    prod.data_prevista_inicio,
    coalesce(prod.data_prevista_fim, benef.data_prevista_entrega) as data_prevista_fim,
    case 
      when op.quantidade_planejada &gt; 0 then round((op.quantidade_produzida / op.quantidade_planejada) * 100, 2)
      else 0 
    end as percentual_concluido,
    case 
      when op.status not in ('concluida', 'cancelada')
       and coalesce(prod.data_prevista_fim, benef.data_prevista_entrega) &lt; now()
      then true else false 
    end as atrasada
  from public.industria_operacoes op
  left join public.industria_producao_ordens prod on prod.id = op.ordem_producao_id
  left join public.industria_benef_ordens benef   on benef.id = op.ordem_beneficiamento_id
  left join public.pessoas cli_prod               on cli_prod.id = prod.cliente_id
  left join public.pessoas cli_benef              on cli_benef.id = benef.cliente_id
  left join public.industria_centros_trabalho ct  on ct.id = op.centro_trabalho_id
  join public.produtos p                          on p.id = op.produto_id
  where op.empresa_id = v_emp
    and (p_centro_id is null or op.centro_trabalho_id = p_centro_id)
    and (p_status is null or op.status = p_status)
    and (
      p_search is null 
      or p.nome ilike '%' || p_search || '%'
      or coalesce(prod.numero, benef.numero)::text ilike '%' || p_search || '%'
    )
  order by op.prioridade desc, op.created_at desc;
end;
$$;
revoke all on function public.industria_operacoes_list(text, uuid, text, text) from public;
grant  execute on function public.industria_operacoes_list(text, uuid, text, text) to authenticated, service_role;

create or replace function public.industria_operacoes_minha_fila(
  p_centro_trabalho_id uuid
)
returns table (
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
set search_path = pg_catalog, public
as $$
begin
  return query
  select
    l.id, l.ordem_id, l.ordem_numero, l.tipo_ordem, l.produto_nome, l.cliente_nome,
    l.centro_trabalho_id, l.centro_trabalho_nome, l.status, l.prioridade,
    l.data_prevista_inicio, l.data_prevista_fim, l.percentual_concluido, l.atrasada,
    op.quantidade_planejada, op.quantidade_produzida, op.quantidade_refugada
  from public.industria_operacoes_list('lista', p_centro_trabalho_id, null, null) l
  join public.industria_operacoes op on op.id = l.id
  where op.status not in ('concluida', 'cancelada')
  order by 
    case when op.status = 'em_execucao' then 0 else 1 end,
    op.prioridade desc,
    op.created_at asc;
end;
$$;
revoke all on function public.industria_operacoes_minha_fila(uuid) from public;
grant  execute on function public.industria_operacoes_minha_fila(uuid) to authenticated, service_role;

create or replace function public.industria_operacao_apontar_execucao(
  p_operacao_id uuid,
  p_acao text, -- 'iniciar' | 'pausar' | 'concluir'
  p_qtd_boas numeric default 0,
  p_qtd_refugadas numeric default 0,
  p_motivo_refugo text default null,
  p_observacoes text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if not exists (select 1 from public.industria_operacoes where id = p_operacao_id and empresa_id = v_emp) then
    raise exception 'Operação não encontrada.';
  end if;

  if p_acao = 'iniciar' then
    update public.industria_operacoes
       set status = 'em_execucao',
           data_inicio_real = coalesce(data_inicio_real, now()),
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;

  elsif p_acao = 'pausar' then
    update public.industria_operacoes
       set status = 'em_espera',
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;

  elsif p_acao = 'concluir' then
    update public.industria_operacoes
       set quantidade_produzida = quantidade_produzida + coalesce(p_qtd_boas,0),
           quantidade_refugada  = quantidade_refugada  + coalesce(p_qtd_refugadas,0),
           status = case when (quantidade_produzida + coalesce(p_qtd_boas,0)) &gt;= quantidade_planejada
                         then 'concluida' else 'liberada' end,
           data_fim_real = case when (quantidade_produzida + coalesce(p_qtd_boas,0)) &gt;= quantidade_planejada
                         then now() else data_fim_real end,
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;
  else
    raise exception 'Ação inválida. Use iniciar|pausar|concluir.';
  end if;

  perform pg_notify('app_log', '[RPC] industria_operacao_apontar_execucao op='||p_operacao_id||' acao='||p_acao);
end;
$$;
revoke all on function public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text) from public;
grant  execute on function public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text) to authenticated, service_role;

create or replace function public.industria_operacao_update_status(
  p_id uuid,
  p_status text,
  p_prioridade int default null,
  p_centro_trabalho_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  update public.industria_operacoes
     set status = p_status,
         prioridade = coalesce(p_prioridade, prioridade),
         updated_at = now()
   where id = p_id
     and empresa_id = v_emp;

  perform pg_notify('app_log', '[RPC] industria_operacao_update_status id='||p_id||' status='||p_status);
end;
$$;
revoke all on function public.industria_operacao_update_status(uuid, text, int, uuid) from public;
grant  execute on function public.industria_operacao_update_status(uuid, text, int, uuid) to authenticated, service_role;

-- ---------------------------------------------------------
-- 7) Ajuste idempotente de entregas
-- ---------------------------------------------------------
alter table public.industria_ordem_entregas
  add column if not exists status_faturamento text default 'nao_faturado',
  add column if not exists documento_faturamento text;

-- ---------------------------------------------------------
-- 8) Reload PostgREST
-- ---------------------------------------------------------
notify pgrst, 'reload schema';
