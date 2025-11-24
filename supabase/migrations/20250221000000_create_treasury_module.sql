/*
  # Financeiro - Tesouraria (Contas Correntes, Movimentos, Extratos e Conciliação)

  ## Query Description
  Cria o módulo de Tesouraria com:
  - Tabela de contas correntes (bancos/caixas/carteiras).
  - Tabela de movimentações financeiras.
  - Tabela de extratos bancários importados.
  - RPCs para listar, detalhar, upsertar e excluir contas/movimentações.
  - RPCs para listar/importar extratos e conciliar manualmente com as movimentações.

  ## Impact Summary
  - Segurança:
    - RLS por operação em todas as novas tabelas.
    - RPCs com SECURITY DEFINER e search_path = pg_catalog, public.
    - Filtro explícito por empresa_id via public.current_empresa_id().
  - Compatibilidade:
    - create table/index if not exists.
    - drop function if exists antes de recriar RPCs.
    - Não altera estruturas existentes de Contas a Pagar/Receber.
*/

-- =============================================
-- 0) Limpeza segura de funções legadas (se existirem)
-- =============================================

drop function if exists public.financeiro_contas_correntes_list(text, boolean, int, int);
drop function if exists public.financeiro_contas_correntes_get(uuid);
drop function if exists public.financeiro_contas_correntes_upsert(jsonb);
drop function if exists public.financeiro_contas_correntes_delete(uuid);

drop function if exists public.financeiro_movimentacoes_list(
  uuid, date, date, text, text, int, int
);
drop function if exists public.financeiro_movimentacoes_get(uuid);
drop function if exists public.financeiro_movimentacoes_upsert(jsonb);
drop function if exists public.financeiro_movimentacoes_delete(uuid);

drop function if exists public.financeiro_extratos_bancarios_list(
  uuid, date, date, boolean, text, int, int
);
drop function if exists public.financeiro_extratos_bancarios_importar(uuid, jsonb);
drop function if exists public.financeiro_extratos_bancarios_vincular_movimentacao(
  uuid, uuid
);
drop function if exists public.financeiro_extratos_bancarios_desvincular(uuid);

-- =============================================
-- 1) Tabela: Contas Correntes
-- =============================================

create table if not exists public.financeiro_contas_correntes (
  id                          uuid primary key default gen_random_uuid(),
  empresa_id                  uuid not null default public.current_empresa_id(),
  nome                        text not null,
  apelido                     text,
  banco_codigo                text,
  banco_nome                  text,
  agencia                     text,
  conta                       text,
  digito                      text,
  tipo_conta                  text not null default 'corrente'
    check (tipo_conta in ('corrente','poupanca','carteira','caixa','outro')),
  moeda                       text not null default 'BRL',
  saldo_inicial               numeric(18,2) not null default 0,
  data_saldo_inicial          date default current_date,
  limite_credito              numeric(18,2) not null default 0,
  permite_saldo_negativo      boolean not null default false,
  ativo                       boolean not null default true,
  padrao_para_pagamentos      boolean not null default false,
  padrao_para_recebimentos    boolean not null default false,
  observacoes                 text,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now(),

  constraint fin_cc_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_cc_empresa_nome_uk
    unique (empresa_id, nome)
);

-- Índices
create index if not exists idx_fin_cc_empresa
  on public.financeiro_contas_correntes (empresa_id);

create index if not exists idx_fin_cc_empresa_ativo
  on public.financeiro_contas_correntes (empresa_id, ativo);

create index if not exists idx_fin_cc_empresa_banco
  on public.financeiro_contas_correntes (empresa_id, banco_codigo);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_financeiro_contas_correntes'
      and tgrelid = 'public.financeiro_contas_correntes'::regclass
  ) then
    create trigger handle_updated_at_financeiro_contas_correntes
      before update on public.financeiro_contas_correntes
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.financeiro_contas_correntes enable row level security;

drop policy if exists "fin_cc_select" on public.financeiro_contas_correntes;
drop policy if exists "fin_cc_insert" on public.financeiro_contas_correntes;
drop policy if exists "fin_cc_update" on public.financeiro_contas_correntes;
drop policy if exists "fin_cc_delete" on public.financeiro_contas_correntes;

create policy "fin_cc_select"
  on public.financeiro_contas_correntes
  for select
  using (empresa_id = public.current_empresa_id());

create policy "fin_cc_insert"
  on public.financeiro_contas_correntes
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "fin_cc_update"
  on public.financeiro_contas_correntes
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "fin_cc_delete"
  on public.financeiro_contas_correntes
  for delete
  using (empresa_id = public.current_empresa_id());


-- =============================================
-- 2) Tabela: Movimentações de Tesouraria
-- =============================================

create table if not exists public.financeiro_movimentacoes (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null default public.current_empresa_id(),
  conta_corrente_id  uuid not null,
  data_movimento     date not null,
  data_competencia   date,
  tipo_mov           text not null
                      check (tipo_mov in ('entrada','saida')),
  valor              numeric(18,2) not null check (valor > 0),
  descricao          text,
  documento_ref      text,
  origem_tipo        text,  -- 'manual','contas_pagar','contas_receber','transferencia','ajuste', etc.
  origem_id          uuid,
  categoria          text,
  centro_custo       text,
  conciliado         boolean not null default false,
  observacoes        text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),

  constraint fin_mov_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_mov_cc_fkey
    foreign key (conta_corrente_id) references public.financeiro_contas_correntes(id) on delete cascade
);

-- Índices
create index if not exists idx_fin_mov_empresa
  on public.financeiro_movimentacoes (empresa_id);

create index if not exists idx_fin_mov_empresa_cc_data
  on public.financeiro_movimentacoes (empresa_id, conta_corrente_id, data_movimento);

create index if not exists idx_fin_mov_empresa_cc_conciliado
  on public.financeiro_movimentacoes (empresa_id, conta_corrente_id, conciliado);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_financeiro_movimentacoes'
      and tgrelid = 'public.financeiro_movimentacoes'::regclass
  ) then
    create trigger handle_updated_at_financeiro_movimentacoes
      before update on public.financeiro_movimentacoes
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.financeiro_movimentacoes enable row level security;

drop policy if exists "fin_mov_select" on public.financeiro_movimentacoes;
drop policy if exists "fin_mov_insert" on public.financeiro_movimentacoes;
drop policy if exists "fin_mov_update" on public.financeiro_movimentacoes;
drop policy if exists "fin_mov_delete" on public.financeiro_movimentacoes;

create policy "fin_mov_select"
  on public.financeiro_movimentacoes
  for select
  using (empresa_id = public.current_empresa_id());

create policy "fin_mov_insert"
  on public.financeiro_movimentacoes
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "fin_mov_update"
  on public.financeiro_movimentacoes
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "fin_mov_delete"
  on public.financeiro_movimentacoes
  for delete
  using (empresa_id = public.current_empresa_id());


-- =============================================
-- 3) Tabela: Extratos Bancários Importados
-- =============================================

create table if not exists public.financeiro_extratos_bancarios (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null default public.current_empresa_id(),
  conta_corrente_id    uuid not null,
  data_lancamento      date not null,
  descricao            text,
  identificador_banco  text,   -- ex: FITID, NSU, nosso número ou ID do arquivo
  documento_ref        text,
  tipo_lancamento      text not null
                         check (tipo_lancamento in ('credito','debito')),
  valor                numeric(18,2) not null check (valor > 0),
  saldo_apos_lancamento numeric(18,2),
  origem_importacao    text,   -- nome do arquivo, sistema de origem etc.
  hash_importacao      text,   -- opcional (pode vir do frontend)
  linha_bruta          text,   -- linha original do CSV/OFX para auditoria
  movimentacao_id      uuid,   -- link opcional para financeiro_movimentacoes
  conciliado           boolean not null default false,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),

  constraint fin_extrato_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_extrato_cc_fkey
    foreign key (conta_corrente_id) references public.financeiro_contas_correntes(id) on delete cascade,
  constraint fin_extrato_mov_fkey
    foreign key (movimentacao_id) references public.financeiro_movimentacoes(id) on delete set null
);

-- Índices
create index if not exists idx_fin_extrato_empresa
  on public.financeiro_extratos_bancarios (empresa_id);

create index if not exists idx_fin_extrato_empresa_cc_data
  on public.financeiro_extratos_bancarios (empresa_id, conta_corrente_id, data_lancamento);

create index if not exists idx_fin_extrato_empresa_cc_conciliado
  on public.financeiro_extratos_bancarios (empresa_id, conta_corrente_id, conciliado);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_financeiro_extratos_bancarios'
      and tgrelid = 'public.financeiro_extratos_bancarios'::regclass
  ) then
    create trigger handle_updated_at_financeiro_extratos_bancarios
      before update on public.financeiro_extratos_bancarios
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.financeiro_extratos_bancarios enable row level security;

drop policy if exists "fin_extrato_select" on public.financeiro_extratos_bancarios;
drop policy if exists "fin_extrato_insert" on public.financeiro_extratos_bancarios;
drop policy if exists "fin_extrato_update" on public.financeiro_extratos_bancarios;
drop policy if exists "fin_extrato_delete" on public.financeiro_extratos_bancarios;

create policy "fin_extrato_select"
  on public.financeiro_extratos_bancarios
  for select
  using (empresa_id = public.current_empresa_id());

create policy "fin_extrato_insert"
  on public.financeiro_extratos_bancarios
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "fin_extrato_update"
  on public.financeiro_extratos_bancarios
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "fin_extrato_delete"
  on public.financeiro_extratos_bancarios
  for delete
  using (empresa_id = public.current_empresa_id());


-- =============================================
-- 4) RPCs - Contas Correntes
-- =============================================

-- 4.1) Listar contas correntes com saldo atual
create or replace function public.financeiro_contas_correntes_list(
  p_search text   default null,
  p_ativo  boolean default null,
  p_limit  int    default 50,
  p_offset int    default 0
)
returns table (
  id                       uuid,
  nome                     text,
  apelido                  text,
  banco_codigo             text,
  banco_nome               text,
  agencia                  text,
  conta                    text,
  tipo_conta               text,
  moeda                    text,
  saldo_atual              numeric,
  ativo                    boolean,
  padrao_para_pagamentos   boolean,
  padrao_para_recebimentos boolean,
  total_count              bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  return query
  select
    cc.id,
    cc.nome,
    cc.apelido,
    cc.banco_codigo,
    cc.banco_nome,
    cc.agencia,
    cc.conta,
    cc.tipo_conta,
    cc.moeda,
    (
      cc.saldo_inicial
      + coalesce((
          select sum(
                   case when m.tipo_mov = 'entrada'
                        then m.valor
                        else -m.valor
                   end
                 )
          from public.financeiro_movimentacoes m
          where m.empresa_id = v_empresa
            and m.conta_corrente_id = cc.id
            and m.data_movimento <= current_date
        ), 0)
    ) as saldo_atual,
    cc.ativo,
    cc.padrao_para_pagamentos,
    cc.padrao_para_recebimentos,
    count(*) over() as total_count
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa
    and (p_ativo is null or cc.ativo = p_ativo)
    and (
      p_search is null
      or cc.nome ilike '%'||p_search||'%'
      or coalesce(cc.apelido,'') ilike '%'||p_search||'%'
      or coalesce(cc.banco_nome,'') ilike '%'||p_search||'%'
      or coalesce(cc.banco_codigo,'') ilike '%'||p_search||'%'
      or coalesce(cc.conta,'') ilike '%'||p_search||'%'
    )
  order by
    cc.ativo desc,
    cc.nome asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.financeiro_contas_correntes_list from public;
grant execute on function public.financeiro_contas_correntes_list to authenticated, service_role;


-- 4.2) Detalhes de conta corrente
create or replace function public.financeiro_contas_correntes_get(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa    uuid := public.current_empresa_id();
  v_result     jsonb;
  v_saldo_atual numeric;
begin
  select
    cc.saldo_inicial
    + coalesce((
        select sum(
                 case when m.tipo_mov = 'entrada'
                      then m.valor
                      else -m.valor
                 end
               )
        from public.financeiro_movimentacoes m
        where m.empresa_id = v_empresa
          and m.conta_corrente_id = cc.id
          and m.data_movimento <= current_date
      ), 0)
  into v_saldo_atual
  from public.financeiro_contas_correntes cc
  where cc.id = p_id
    and cc.empresa_id = v_empresa;

  select
    to_jsonb(cc.*)
    || jsonb_build_object('saldo_atual', coalesce(v_saldo_atual, cc.saldo_inicial))
  into v_result
  from public.financeiro_contas_correntes cc
  where cc.id = p_id
    and cc.empresa_id = v_empresa;

  return v_result;
end;
$$;

revoke all on function public.financeiro_contas_correntes_get from public;
grant execute on function public.financeiro_contas_correntes_get to authenticated, service_role;


-- 4.3) Upsert conta corrente
create or replace function public.financeiro_contas_correntes_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid;
  v_padrao_pag boolean;
  v_padrao_rec boolean;
begin
  if p_payload->>'nome' is null or trim(p_payload->>'nome') = '' then
    raise exception 'Nome da conta corrente é obrigatório.';
  end if;

  v_padrao_pag := coalesce((p_payload->>'padrao_para_pagamentos')::boolean, false);
  v_padrao_rec := coalesce((p_payload->>'padrao_para_recebimentos')::boolean, false);

  if p_payload->>'id' is not null then
    update public.financeiro_contas_correntes cc
    set
      nome                     = p_payload->>'nome',
      apelido                  = p_payload->>'apelido',
      banco_codigo             = p_payload->>'banco_codigo',
      banco_nome               = p_payload->>'banco_nome',
      agencia                  = p_payload->>'agencia',
      conta                    = p_payload->>'conta',
      digito                   = p_payload->>'digito',
      tipo_conta               = coalesce(p_payload->>'tipo_conta', tipo_conta),
      moeda                    = coalesce(p_payload->>'moeda', moeda),
      saldo_inicial            = coalesce((p_payload->>'saldo_inicial')::numeric, saldo_inicial),
      data_saldo_inicial       = coalesce((p_payload->>'data_saldo_inicial')::date, data_saldo_inicial),
      limite_credito           = coalesce((p_payload->>'limite_credito')::numeric, limite_credito),
      permite_saldo_negativo   = coalesce((p_payload->>'permite_saldo_negativo')::boolean, permite_saldo_negativo),
      ativo                    = coalesce((p_payload->>'ativo')::boolean, ativo),
      padrao_para_pagamentos   = v_padrao_pag,
      padrao_para_recebimentos = v_padrao_rec,
      observacoes              = p_payload->>'observacoes'
    where cc.id = (p_payload->>'id')::uuid
      and cc.empresa_id = v_empresa
    returning cc.id into v_id;
  else
    insert into public.financeiro_contas_correntes (
      empresa_id,
      nome,
      apelido,
      banco_codigo,
      banco_nome,
      agencia,
      conta,
      digito,
      tipo_conta,
      moeda,
      saldo_inicial,
      data_saldo_inicial,
      limite_credito,
      permite_saldo_negativo,
      ativo,
      padrao_para_pagamentos,
      padrao_para_recebimentos,
      observacoes
    ) values (
      v_empresa,
      p_payload->>'nome',
      p_payload->>'apelido',
      p_payload->>'banco_codigo',
      p_payload->>'banco_nome',
      p_payload->>'agencia',
      p_payload->>'conta',
      p_payload->>'digito',
      coalesce(p_payload->>'tipo_conta', 'corrente'),
      coalesce(p_payload->>'moeda', 'BRL'),
      coalesce((p_payload->>'saldo_inicial')::numeric, 0),
      coalesce((p_payload->>'data_saldo_inicial')::date, current_date),
      coalesce((p_payload->>'limite_credito')::numeric, 0),
      coalesce((p_payload->>'permite_saldo_negativo')::boolean, false),
      coalesce((p_payload->>'ativo')::boolean, true),
      v_padrao_pag,
      v_padrao_rec,
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  -- Garante unicidade de contas padrão por empresa
  if v_padrao_pag then
    update public.financeiro_contas_correntes
    set padrao_para_pagamentos = false
    where empresa_id = v_empresa
      and id <> v_id;
  end if;

  if v_padrao_rec then
    update public.financeiro_contas_correntes
    set padrao_para_recebimentos = false
    where empresa_id = v_empresa
      and id <> v_id;
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_contas_correntes_upsert: ' || v_id
  );

  return public.financeiro_contas_correntes_get(v_id);
end;
$$;

revoke all on function public.financeiro_contas_correntes_upsert from public;
grant execute on function public.financeiro_contas_correntes_upsert to authenticated, service_role;


-- 4.4) Delete conta corrente (bloqueia se tiver movimentos ou extratos)
create or replace function public.financeiro_contas_correntes_delete(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_has_ref boolean;
begin
  -- Verifica se há movimentações vinculadas
  select exists (
    select 1
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and m.conta_corrente_id = p_id
  )
  into v_has_ref;

  if v_has_ref then
    raise exception 'Conta corrente possui movimentações vinculadas. Desative a conta em vez de excluir.';
  end if;

  -- Verifica se há extratos vinculados
  select exists (
    select 1
    from public.financeiro_extratos_bancarios e
    where e.empresa_id = v_empresa
      and e.conta_corrente_id = p_id
  )
  into v_has_ref;

  if v_has_ref then
    raise exception 'Conta corrente possui extratos vinculados. Desative a conta em vez de excluir.';
  end if;

  delete from public.financeiro_contas_correntes
  where id = p_id
    and empresa_id = v_empresa;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_contas_correntes_delete: ' || p_id
  );
end;
$$;

revoke all on function public.financeiro_contas_correntes_delete from public;
grant execute on function public.financeiro_contas_correntes_delete to authenticated, service_role;


-- =============================================
-- 5) RPCs - Movimentações
-- =============================================

-- 5.1) Listar movimentações com saldo acumulado
create or replace function public.financeiro_movimentacoes_list(
  p_conta_corrente_id uuid,
  p_start_date        date  default null,
  p_end_date          date  default null,
  p_tipo_mov          text  default null, -- 'entrada' | 'saida'
  p_q                 text  default null,
  p_limit             int   default 100,
  p_offset            int   default 0
)
returns table (
  id                 uuid,
  data_movimento     date,
  data_competencia   date,
  tipo_mov           text,
  descricao          text,
  documento_ref      text,
  origem_tipo        text,
  origem_id          uuid,
  valor_entrada      numeric,
  valor_saida        numeric,
  saldo_acumulado    numeric,
  conciliado         boolean,
  total_count        bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa    uuid := public.current_empresa_id();
  v_saldo_base numeric;
begin
  if p_conta_corrente_id is null then
    raise exception 'p_conta_corrente_id é obrigatório.';
  end if;

  if p_tipo_mov is not null and p_tipo_mov not in ('entrada','saida') then
    raise exception 'p_tipo_mov inválido. Use entrada ou saida.';
  end if;

  -- saldo antes do período (saldo_inicial + movimentos anteriores ao start_date)
  select
    cc.saldo_inicial
    + coalesce((
        select sum(
                 case when m.tipo_mov = 'entrada'
                      then m.valor
                      else -m.valor
                 end
               )
        from public.financeiro_movimentacoes m
        where m.empresa_id = v_empresa
          and m.conta_corrente_id = cc.id
          and (p_start_date is not null and m.data_movimento < p_start_date)
      ), 0)
  into v_saldo_base
  from public.financeiro_contas_correntes cc
  where cc.id = p_conta_corrente_id
    and cc.empresa_id = v_empresa;

  v_saldo_base := coalesce(v_saldo_base, 0);

  return query
  with movs as (
    select
      m.id,
      m.data_movimento,
      m.data_competencia,
      m.tipo_mov,
      m.descricao,
      m.documento_ref,
      m.origem_tipo,
      m.origem_id,
      m.valor,
      m.conciliado,
      m.created_at,
      count(*) over() as total_count,
      case when m.tipo_mov = 'entrada' then m.valor else 0 end as val_entrada,
      case when m.tipo_mov = 'saida'   then m.valor else 0 end as val_saida
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and m.conta_corrente_id = p_conta_corrente_id
      and (p_start_date is null or m.data_movimento >= p_start_date)
      and (p_end_date   is null or m.data_movimento <= p_end_date)
      and (p_tipo_mov   is null or m.tipo_mov = p_tipo_mov)
      and (
        p_q is null
        or m.descricao ilike '%'||p_q||'%'
        or coalesce(m.documento_ref,'') ilike '%'||p_q||'%'
        or coalesce(m.origem_tipo,'')   ilike '%'||p_q||'%'
      )
  )
  select
    mv.id,
    mv.data_movimento,
    mv.data_competencia,
    mv.tipo_mov,
    mv.descricao,
    mv.documento_ref,
    mv.origem_tipo,
    mv.origem_id,
    mv.val_entrada as valor_entrada,
    mv.val_saida   as valor_saida,
    v_saldo_base
      + sum(
          case when mv.tipo_mov = 'entrada'
               then mv.valor
               else -mv.valor
          end
        ) over (
          order by mv.data_movimento asc, mv.created_at asc, mv.id asc
        ) as saldo_acumulado,
    mv.conciliado,
    mv.total_count
  from movs mv
  order by
    mv.data_movimento asc,
    mv.created_at asc,
    mv.id asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.financeiro_movimentacoes_list from public;
grant execute on function public.financeiro_movimentacoes_list to authenticated, service_role;


-- 5.2) Detalhes de movimentação
create or replace function public.financeiro_movimentacoes_get(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_result  jsonb;
begin
  select
    to_jsonb(m.*)
    || jsonb_build_object(
         'conta_nome', cc.nome
       )
  into v_result
  from public.financeiro_movimentacoes m
  join public.financeiro_contas_correntes cc
    on cc.id = m.conta_corrente_id
   and cc.empresa_id = v_empresa
  where m.id = p_id
    and m.empresa_id = v_empresa;

  return v_result;
end;
$$;

revoke all on function public.financeiro_movimentacoes_get from public;
grant execute on function public.financeiro_movimentacoes_get to authenticated, service_role;


-- 5.3) Upsert movimentação
create or replace function public.financeiro_movimentacoes_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid;
  v_tipo    text;
  v_valor   numeric;
  v_cc_id   uuid;
begin
  v_tipo  := coalesce(p_payload->>'tipo_mov', 'entrada');
  v_valor := (p_payload->>'valor')::numeric;
  v_cc_id := (p_payload->>'conta_corrente_id')::uuid;

  if v_cc_id is null then
    raise exception 'conta_corrente_id é obrigatório.';
  end if;

  if v_valor is null or v_valor <= 0 then
    raise exception 'valor deve ser maior que zero.';
  end if;

  if v_tipo not in ('entrada','saida') then
    raise exception 'tipo_mov inválido. Use entrada ou saida.';
  end if;

  -- valida conta corrente da empresa
  if not exists (
    select 1
    from public.financeiro_contas_correntes cc
    where cc.id = v_cc_id
      and cc.empresa_id = v_empresa
  ) then
    raise exception 'Conta corrente não encontrada ou acesso negado.';
  end if;

  if p_payload->>'id' is not null then
    update public.financeiro_movimentacoes m
    set
      conta_corrente_id = v_cc_id,
      data_movimento    = (p_payload->>'data_movimento')::date,
      data_competencia  = (p_payload->>'data_competencia')::date,
      tipo_mov          = v_tipo,
      valor             = v_valor,
      descricao         = p_payload->>'descricao',
      documento_ref     = p_payload->>'documento_ref',
      origem_tipo       = p_payload->>'origem_tipo',
      origem_id         = (p_payload->>'origem_id')::uuid,
      categoria         = p_payload->>'categoria',
      centro_custo      = p_payload->>'centro_custo',
      observacoes       = p_payload->>'observacoes'
      -- conciliado NÃO é alterado aqui; só via conciliação
    where m.id = (p_payload->>'id')::uuid
      and m.empresa_id = v_empresa
    returning m.id into v_id;
  else
    insert into public.financeiro_movimentacoes (
      empresa_id,
      conta_corrente_id,
      data_movimento,
      data_competencia,
      tipo_mov,
      valor,
      descricao,
      documento_ref,
      origem_tipo,
      origem_id,
      categoria,
      centro_custo,
      conciliado,
      observacoes
    ) values (
      v_empresa,
      v_cc_id,
      (p_payload->>'data_movimento')::date,
      (p_payload->>'data_competencia')::date,
      v_tipo,
      v_valor,
      p_payload->>'descricao',
      p_payload->>'documento_ref',
      p_payload->>'origem_tipo',
      (p_payload->>'origem_id')::uuid,
      p_payload->>'categoria',
      p_payload->>'centro_custo',
      false,
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_movimentacoes_upsert: ' || v_id
  );

  return public.financeiro_movimentacoes_get(v_id);
end;
$$;

revoke all on function public.financeiro_movimentacoes_upsert from public;
grant execute on function public.financeiro_movimentacoes_upsert to authenticated, service_role;


-- 5.4) Delete movimentação (bloqueia se conciliada)
create or replace function public.financeiro_movimentacoes_delete(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_conc    boolean;
begin
  select m.conciliado
  into v_conc
  from public.financeiro_movimentacoes m
  where m.id = p_id
    and m.empresa_id = v_empresa;

  if v_conc then
    raise exception 'Movimentação já conciliada. Desfaça a conciliação antes de excluir.';
  end if;

  delete from public.financeiro_movimentacoes
  where id = p_id
    and empresa_id = v_empresa;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_movimentacoes_delete: ' || p_id
  );
end;
$$;

revoke all on function public.financeiro_movimentacoes_delete from public;
grant execute on function public.financeiro_movimentacoes_delete to authenticated, service_role;


-- =============================================
-- 6) RPCs - Extratos Bancários & Conciliação
-- =============================================

-- 6.1) Listar extratos com possível link para movimentações
create or replace function public.financeiro_extratos_bancarios_list(
  p_conta_corrente_id uuid,
  p_start_date        date   default null,
  p_end_date          date   default null,
  p_conciliado        boolean default null,
  p_q                 text   default null,
  p_limit             int    default 100,
  p_offset            int    default 0
)
returns table (
  id                    uuid,
  data_lancamento       date,
  descricao             text,
  documento_ref         text,
  tipo_lancamento       text,
  valor                 numeric,
  saldo_apos_lancamento numeric,
  conciliado            boolean,
  movimentacao_id       uuid,
  movimentacao_data     date,
  movimentacao_descricao text,
  movimentacao_valor    numeric,
  total_count           bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_conta_corrente_id is null then
    raise exception 'p_conta_corrente_id é obrigatório.';
  end if;

  return query
  select
    e.id,
    e.data_lancamento,
    e.descricao,
    e.documento_ref,
    e.tipo_lancamento,
    e.valor,
    e.saldo_apos_lancamento,
    e.conciliado,
    e.movimentacao_id,
    m.data_movimento as movimentacao_data,
    m.descricao      as movimentacao_descricao,
    m.valor          as movimentacao_valor,
    count(*) over()  as total_count
  from public.financeiro_extratos_bancarios e
  left join public.financeiro_movimentacoes m
    on m.id = e.movimentacao_id
   and m.empresa_id = v_empresa
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date)
    and (p_conciliado is null or e.conciliado = p_conciliado)
    and (
      p_q is null
      or e.descricao ilike '%'||p_q||'%'
      or coalesce(e.documento_ref,'') ilike '%'||p_q||'%'
    )
  order by
    e.data_lancamento asc,
    e.created_at asc,
    e.id asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_list from public;
grant execute on function public.financeiro_extratos_bancarios_list to authenticated, service_role;


-- 6.2) Importar extrato (JSON array)
create or replace function public.financeiro_extratos_bancarios_importar(
  p_conta_corrente_id uuid,
  p_itens             jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_item    jsonb;
  v_count   integer := 0;

  v_data      date;
  v_desc      text;
  v_doc       text;
  v_tipo      text;
  v_valor     numeric;
  v_saldo     numeric;
  v_id_banco  text;
  v_hash      text;
  v_linha     text;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'p_itens deve ser um array JSON.';
  end if;

  -- valida conta corrente
  if not exists (
    select 1
    from public.financeiro_contas_correntes cc
    where cc.id = p_conta_corrente_id
      and cc.empresa_id = v_empresa
  ) then
    raise exception 'Conta corrente não encontrada ou acesso negado.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_data     := (v_item->>'data_lancamento')::date;
    v_desc     := v_item->>'descricao';
    v_doc      := v_item->>'documento_ref';
    v_tipo     := coalesce(v_item->>'tipo_lancamento', 'credito');
    v_valor    := (v_item->>'valor')::numeric;
    v_saldo    := (v_item->>'saldo_apos_lancamento')::numeric;
    v_id_banco := v_item->>'identificador_banco';
    v_hash     := v_item->>'hash_importacao';
    v_linha    := v_item->>'linha_bruta';

    if v_data is null or v_valor is null or v_valor <= 0 then
      continue;
    end if;

    if v_tipo not in ('credito','debito') then
      v_tipo := 'credito';
    end if;

    -- evita duplicatas simples por combinação básica
    if exists (
      select 1
      from public.financeiro_extratos_bancarios e
      where e.empresa_id = v_empresa
        and e.conta_corrente_id = p_conta_corrente_id
        and e.data_lancamento = v_data
        and e.valor = v_valor
        and coalesce(e.identificador_banco,'') = coalesce(v_id_banco,'')
        and coalesce(e.documento_ref,'') = coalesce(v_doc,'')
    ) then
      continue;
    end if;

    insert into public.financeiro_extratos_bancarios (
      empresa_id,
      conta_corrente_id,
      data_lancamento,
      descricao,
      identificador_banco,
      documento_ref,
      tipo_lancamento,
      valor,
      saldo_apos_lancamento,
      origem_importacao,
      hash_importacao,
      linha_bruta,
      conciliado
    ) values (
      v_empresa,
      p_conta_corrente_id,
      v_data,
      v_desc,
      v_id_banco,
      v_doc,
      v_tipo,
      v_valor,
      v_saldo,
      'upload_json',
      v_hash,
      v_linha,
      false
    );

    v_count := v_count + 1;
  end loop;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_extratos_bancarios_importar: conta=' || p_conta_corrente_id || ' qtd=' || v_count
  );

  return v_count;
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_importar from public;
grant execute on function public.financeiro_extratos_bancarios_importar to authenticated, service_role;


-- 6.3) Vincular extrato a movimentação (conciliação manual)
create or replace function public.financeiro_extratos_bancarios_vincular_movimentacao(
  p_extrato_id      uuid,
  p_movimentacao_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_mov     record;
begin
  select *
  into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.';
  end if;

  select *
  into v_mov
  from public.financeiro_movimentacoes m
  where m.id = p_movimentacao_id
    and m.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Movimentação não encontrada ou acesso negado.';
  end if;

  -- valida mesma conta
  if v_extrato.conta_corrente_id <> v_mov.conta_corrente_id then
    raise exception 'Conta do extrato difere da conta da movimentação.';
  end if;

  -- valida sinal (credito vs entrada, debito vs saída)
  if v_extrato.tipo_lancamento = 'credito' and v_mov.tipo_mov <> 'entrada' then
    raise exception 'Lançamento de crédito só pode ser conciliado com movimentação de entrada.';
  end if;

  if v_extrato.tipo_lancamento = 'debito' and v_mov.tipo_mov <> 'saida' then
    raise exception 'Lançamento de débito só pode ser conciliado com movimentação de saída.';
  end if;

  -- faz vínculo
  update public.financeiro_extratos_bancarios
  set
    movimentacao_id = v_mov.id,
    conciliado      = true
  where id = v_extrato.id;

  update public.financeiro_movimentacoes
  set conciliado = true
  where id = v_mov.id;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_extratos_bancarios_vincular_movimentacao: extrato='
      || p_extrato_id || ' mov=' || p_movimentacao_id
  );
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_vincular_movimentacao from public;
grant execute on function public.financeiro_extratos_bancarios_vincular_movimentacao to authenticated, service_role;


-- 6.4) Desvincular extrato (desfazer conciliação)
create or replace function public.financeiro_extratos_bancarios_desvincular(
  p_extrato_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_mov_id  uuid;
begin
  select movimentacao_id
  into v_mov_id
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  update public.financeiro_extratos_bancarios
  set
    movimentacao_id = null,
    conciliado      = false
  where id = p_extrato_id
    and empresa_id = v_empresa;

  -- se nenhuma outra linha de extrato estiver ligada a essa movimentação, marca como não conciliada
  if v_mov_id is not null then
    if not exists (
      select 1
      from public.financeiro_extratos_bancarios e2
      where e2.empresa_id = v_empresa
        and e2.movimentacao_id = v_mov_id
    ) then
      update public.financeiro_movimentacoes
      set conciliado = false
      where id = v_mov_id
        and empresa_id = v_empresa;
    end if;
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_extratos_bancarios_desvincular: extrato=' || p_extrato_id
  );
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_desvincular from public;
grant execute on function public.financeiro_extratos_bancarios_desvincular to authenticated, service_role;
