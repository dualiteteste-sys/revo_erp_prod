/*
  # Financeiro - Cobranças Bancárias (backend completo, tolerante à ausência de Contas a Receber)

  ## Query Description
  Cria/substitui o backend do módulo de Cobranças Bancárias com:
  - Tabela principal de cobranças ligada a Tesouraria e opcionalmente a Contas a Receber.
  - Tabela de eventos (status/webhooks/erros).
  - RLS por operação em todas as tabelas.
  - RPCs de listagem, detalhes, upsert, delete seguro e resumo.
  - FK para financeiro_contas_receber criada apenas se a tabela existir.

  ## Impact Summary
  - Segurança:
    - Multi-tenant por empresa_id + RLS.
    - RPCs com SECURITY DEFINER e search_path = pg_catalog, public.
  - Compatibilidade:
    - create table/index if not exists.
    - FK condicional para evitar falhas em ambientes sem Contas a Receber.
  - Performance:
    - Índices em empresa_id, status, datas e relacionamentos.
*/

-- =============================================
-- 0) Limpeza segura de RPCs legadas (se houver)
-- =============================================

drop function if exists public.financeiro_cobrancas_bancarias_list(
  text, text, uuid, date, date, int, int
);
drop function if exists public.financeiro_cobrancas_bancarias_get(uuid);
drop function if exists public.financeiro_cobrancas_bancarias_upsert(jsonb);
drop function if exists public.financeiro_cobrancas_bancarias_delete(uuid);
drop function if exists public.financeiro_cobrancas_bancarias_summary(date, date, text);

-- =============================================
-- 1) Tabela principal: Cobranças Bancárias
-- =============================================

create table if not exists public.financeiro_cobrancas_bancarias (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null default public.current_empresa_id(),

  conta_receber_id      uuid,                        -- FK opcional (condicional) para título (contas a receber)
  cliente_id            uuid,                        -- redundância para busca rápida
  conta_corrente_id     uuid,                        -- conta da tesouraria usada/prevista

  documento_ref         text,                        -- ex: número da fatura / NF
  descricao             text,                        -- descrição amigável da cobrança

  tipo_cobranca         text not null default 'boleto'
                        check (tipo_cobranca in (
                          'boleto','pix','carne','link_pagamento','outro'
                        )),

  -- Dados de boleto
  nosso_numero          text,
  carteira_codigo       text,
  linha_digitavel       text,
  codigo_barras         text,

  -- Dados PIX / link
  pix_txid              text,
  pix_qr_code           text,
  url_pagamento         text,

  valor_original        numeric(15,2) not null check (valor_original >= 0),
  valor_atual           numeric(15,2) not null default 0 check (valor_atual >= 0),

  data_emissao          date,
  data_vencimento       date not null,
  data_liquidacao       date,

  status                text not null default 'pendente_emissao'
                        check (status in (
                          'pendente_emissao',
                          'emitida',
                          'registrada',
                          'enviada',
                          'liquidada',
                          'baixada',
                          'cancelada',
                          'erro'
                        )),

  origem_tipo           text,                        -- 'manual','contas_receber','remessa','api', etc.
  origem_id             uuid,

  observacoes           text,

  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),

  constraint fin_cobr_emp_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,

  constraint fin_cobr_cliente_fkey
    foreign key (cliente_id) references public.pessoas(id),

  constraint fin_cobr_cc_fkey
    foreign key (conta_corrente_id) references public.financeiro_contas_correntes(id)
      on delete set null
);

-- FK condicional para financeiro_contas_receber (evita falhar em bancos onde o módulo ainda não existe)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'financeiro_contas_receber'
  ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'fin_cobr_cr_fkey'
        and conrelid = 'public.financeiro_cobrancas_bancarias'::regclass
    ) then
      alter table public.financeiro_cobrancas_bancarias
        add constraint fin_cobr_cr_fkey
          foreign key (conta_receber_id)
          references public.financeiro_contas_receber(id)
          on delete set null;
    end if;
  end if;
end;
$$;

-- Índices principais
create index if not exists idx_fin_cobr_empresa
  on public.financeiro_cobrancas_bancarias (empresa_id);

create index if not exists idx_fin_cobr_empresa_status
  on public.financeiro_cobrancas_bancarias (empresa_id, status);

create index if not exists idx_fin_cobr_empresa_venc
  on public.financeiro_cobrancas_bancarias (empresa_id, data_vencimento);

create index if not exists idx_fin_cobr_empresa_cliente
  on public.financeiro_cobrancas_bancarias (empresa_id, cliente_id);

create index if not exists idx_fin_cobr_empresa_conta_receber
  on public.financeiro_cobrancas_bancarias (empresa_id, conta_receber_id);

create index if not exists idx_fin_cobr_empresa_cc
  on public.financeiro_cobrancas_bancarias (empresa_id, conta_corrente_id);

create index if not exists idx_fin_cobr_empresa_tipo
  on public.financeiro_cobrancas_bancarias (empresa_id, tipo_cobranca);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_financeiro_cobrancas_bancarias'
      and tgrelid = 'public.financeiro_cobrancas_bancarias'::regclass
  ) then
    create trigger handle_updated_at_financeiro_cobrancas_bancarias
      before update on public.financeiro_cobrancas_bancarias
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =============================================
-- 2) Tabela de eventos / histórico da cobrança
-- =============================================

create table if not exists public.financeiro_cobrancas_bancarias_eventos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.current_empresa_id(),
  cobranca_id      uuid not null,
  tipo_evento      text not null,    -- 'status_change','webhook','erro','info', etc.
  status_anterior  text,
  status_novo      text,
  mensagem         text,
  detalhe_tecnico  text,
  criado_em        timestamptz default now(),

  constraint fin_cobr_evt_emp_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,

  constraint fin_cobr_evt_cobr_fkey
    foreign key (cobranca_id) references public.financeiro_cobrancas_bancarias(id)
      on delete cascade
);

create index if not exists idx_fin_cobr_evt_empresa
  on public.financeiro_cobrancas_bancarias_eventos (empresa_id);

create index if not exists idx_fin_cobr_evt_empresa_cobr
  on public.financeiro_cobrancas_bancarias_eventos (empresa_id, cobranca_id, criado_em);

-- =============================================
-- 3) RLS por operação
-- =============================================

alter table public.financeiro_cobrancas_bancarias          enable row level security;
alter table public.financeiro_cobrancas_bancarias_eventos  enable row level security;

-- cobrancas
drop policy if exists "fin_cobr_select" on public.financeiro_cobrancas_bancarias;
drop policy if exists "fin_cobr_insert" on public.financeiro_cobrancas_bancarias;
drop policy if exists "fin_cobr_update" on public.financeiro_cobrancas_bancarias;
drop policy if exists "fin_cobr_delete" on public.financeiro_cobrancas_bancarias;

create policy "fin_cobr_select"
  on public.financeiro_cobrancas_bancarias
  for select
  using (empresa_id = public.current_empresa_id());

create policy "fin_cobr_insert"
  on public.financeiro_cobrancas_bancarias
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "fin_cobr_update"
  on public.financeiro_cobrancas_bancarias
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "fin_cobr_delete"
  on public.financeiro_cobrancas_bancarias
  for delete
  using (empresa_id = public.current_empresa_id());

-- eventos
drop policy if exists "fin_cobr_evt_select" on public.financeiro_cobrancas_bancarias_eventos;
drop policy if exists "fin_cobr_evt_insert" on public.financeiro_cobrancas_bancarias_eventos;
drop policy if exists "fin_cobr_evt_update" on public.financeiro_cobrancas_bancarias_eventos;
drop policy if exists "fin_cobr_evt_delete" on public.financeiro_cobrancas_bancarias_eventos;

create policy "fin_cobr_evt_select"
  on public.financeiro_cobrancas_bancarias_eventos
  for select
  using (empresa_id = public.current_empresa_id());

create policy "fin_cobr_evt_insert"
  on public.financeiro_cobrancas_bancarias_eventos
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "fin_cobr_evt_update"
  on public.financeiro_cobrancas_bancarias_eventos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "fin_cobr_evt_delete"
  on public.financeiro_cobrancas_bancarias_eventos
  for delete
  using (empresa_id = public.current_empresa_id());

-- =============================================
-- 4) RPCs - Listagem, detalhes, upsert, delete e resumo
-- =============================================

create or replace function public.financeiro_cobrancas_bancarias_list(
  p_q              text   default null,
  p_status         text   default null,
  p_cliente_id     uuid   default null,
  p_start_venc     date   default null,
  p_end_venc       date   default null,
  p_limit          int    default 50,
  p_offset         int    default 0
)
returns table (
  id               uuid,
  conta_receber_id uuid,
  cliente_id       uuid,
  cliente_nome     text,
  conta_corrente_id uuid,
  conta_nome       text,
  documento_ref    text,
  descricao        text,
  tipo_cobranca    text,
  status           text,
  data_emissao     date,
  data_vencimento  date,
  data_liquidacao  date,
  valor_original   numeric,
  valor_atual      numeric,
  total_count      bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_status is not null and p_status not in (
    'pendente_emissao',
    'emitida',
    'registrada',
    'enviada',
    'liquidada',
    'baixada',
    'cancelada',
    'erro'
  ) then
    raise exception 'Status de cobrança inválido.';
  end if;

  return query
  select
    c.id,
    c.conta_receber_id,
    c.cliente_id,
    cli.nome as cliente_nome,
    c.conta_corrente_id,
    cc.nome  as conta_nome,
    c.documento_ref,
    c.descricao,
    c.tipo_cobranca,
    c.status,
    c.data_emissao,
    c.data_vencimento,
    c.data_liquidacao,
    c.valor_original,
    c.valor_atual,
    count(*) over() as total_count
  from public.financeiro_cobrancas_bancarias c
  left join public.pessoas cli
    on cli.id = c.cliente_id
  left join public.financeiro_contas_correntes cc
    on cc.id = c.conta_corrente_id
   and cc.empresa_id = v_empresa
  where c.empresa_id = v_empresa
    and (p_status     is null or c.status = p_status)
    and (p_cliente_id is null or c.cliente_id = p_cliente_id)
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (
      p_q is null
      or c.descricao ilike '%'||p_q||'%'
      or coalesce(c.documento_ref,'') ilike '%'||p_q||'%'
      or coalesce(cli.nome,'') ilike '%'||p_q||'%'
      or coalesce(c.nosso_numero,'') ilike '%'||p_q||'%'
      or coalesce(c.linha_digitavel,'') ilike '%'||p_q||'%'
    )
  order by
    (c.status in ('pendente_emissao','emitida','registrada','enviada')) desc,
    c.data_vencimento asc nulls last,
    c.created_at asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.financeiro_cobrancas_bancarias_list from public;
grant execute on function public.financeiro_cobrancas_bancarias_list to authenticated, service_role;

create or replace function public.financeiro_cobrancas_bancarias_get(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa       uuid := public.current_empresa_id();
  v_res           jsonb;
  v_evt           jsonb;
  v_titulo_numero text;
  v_cr_id         uuid;
begin
  select jsonb_agg(
           jsonb_build_object(
             'id', e.id,
             'tipo_evento', e.tipo_evento,
             'status_anterior', e.status_anterior,
             'status_novo', e.status_novo,
             'mensagem', e.mensagem,
             'criado_em', e.criado_em
           )
           order by e.criado_em desc, e.id
         )
  into v_evt
  from public.financeiro_cobrancas_bancarias_eventos e
  where e.empresa_id = v_empresa
    and e.cobranca_id = p_id;

  select
    c.conta_receber_id
  into v_cr_id
  from public.financeiro_cobrancas_bancarias c
  where c.id = p_id
    and c.empresa_id = v_empresa;

  if v_cr_id is not null then
    begin
      execute $sql$
        select cr.numero_titulo
        from public.financeiro_contas_receber cr
        where cr.id = $1
          and cr.empresa_id = $2
      $sql$
      into v_titulo_numero
      using v_cr_id, v_empresa;
    exception
      when undefined_table then
        v_titulo_numero := null;
    end;
  end if;

  select
    to_jsonb(c.*)
    || jsonb_build_object(
      'cliente_nome', cli.nome,
      'conta_nome', cc.nome,
      'eventos', coalesce(v_evt, '[]'::jsonb),
      'titulo_numero', v_titulo_numero
    )
  into v_res
  from public.financeiro_cobrancas_bancarias c
  left join public.pessoas cli
    on cli.id = c.cliente_id
  left join public.financeiro_contas_correntes cc
    on cc.id = c.conta_corrente_id
   and cc.empresa_id = v_empresa
  where c.id = p_id
    and c.empresa_id = v_empresa;

  return v_res;
end;
$$;

revoke all on function public.financeiro_cobrancas_bancarias_get from public;
grant execute on function public.financeiro_cobrancas_bancarias_get to authenticated, service_role;

create or replace function public.financeiro_cobrancas_bancarias_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa    uuid := public.current_empresa_id();
  v_id         uuid;
  v_status     text;
  v_tipo       text;
  v_cr_id      uuid;
  v_cliente    uuid;
  v_cc_id      uuid;
  v_valor_orig numeric;
  v_cr_exists  boolean;
begin
  if p_payload->>'data_vencimento' is null then
    raise exception 'data_vencimento é obrigatória.';
  end if;

  v_valor_orig := (p_payload->>'valor_original')::numeric;
  if v_valor_orig is null or v_valor_orig < 0 then
    raise exception 'valor_original é obrigatório e deve ser >= 0.';
  end if;

  v_status := coalesce(p_payload->>'status', 'pendente_emissao');
  if v_status not in (
    'pendente_emissao',
    'emitida',
    'registrada',
    'enviada',
    'liquidada',
    'baixada',
    'cancelada',
    'erro'
  ) then
    raise exception 'Status de cobrança inválido.';
  end if;

  v_tipo := coalesce(p_payload->>'tipo_cobranca', 'boleto');
  if v_tipo not in ('boleto','pix','carne','link_pagamento','outro') then
    raise exception 'tipo_cobranca inválido.';
  end if;

  v_cr_id   := (p_payload->>'conta_receber_id')::uuid;
  v_cliente := (p_payload->>'cliente_id')::uuid;
  v_cc_id   := (p_payload->>'conta_corrente_id')::uuid;

  if v_cr_id is not null then
    v_cr_exists := true;
    begin
      execute $sql$
        select exists(
          select 1
          from public.financeiro_contas_receber cr
          where cr.id = $1
            and cr.empresa_id = $2
        )
      $sql$
      into v_cr_exists
      using v_cr_id, v_empresa;
    exception
      when undefined_table then
        v_cr_exists := true;
    end;

    if not v_cr_exists then
      raise exception 'Título (conta a receber) não encontrado ou acesso negado.';
    end if;
  end if;

  if v_cliente is not null then
    if not exists (
      select 1
      from public.pessoas p
      where p.id = v_cliente
    ) then
      raise exception 'Cliente vinculado não encontrado.';
    end if;
  end if;

  if v_cc_id is not null then
    if not exists (
      select 1
      from public.financeiro_contas_correntes cc
      where cc.id = v_cc_id
        and cc.empresa_id = v_empresa
    ) then
      raise exception 'Conta corrente vinculada não encontrada ou acesso negado.';
    end if;
  end if;

  if p_payload->>'id' is not null then
    update public.financeiro_cobrancas_bancarias c
    set
      conta_receber_id  = v_cr_id,
      cliente_id        = coalesce(v_cliente, cliente_id),
      conta_corrente_id = v_cc_id,
      documento_ref     = p_payload->>'documento_ref',
      descricao         = p_payload->>'descricao',
      tipo_cobranca     = v_tipo,
      nosso_numero      = p_payload->>'nosso_numero',
      carteira_codigo   = p_payload->>'carteira_codigo',
      linha_digitavel   = p_payload->>'linha_digitavel',
      codigo_barras     = p_payload->>'codigo_barras',
      pix_txid          = p_payload->>'pix_txid',
      pix_qr_code       = p_payload->>'pix_qr_code',
      url_pagamento     = p_payload->>'url_pagamento',
      valor_original    = v_valor_orig,
      valor_atual       = coalesce((p_payload->>'valor_atual')::numeric, v_valor_orig),
      data_emissao      = (p_payload->>'data_emissao')::date,
      data_vencimento   = (p_payload->>'data_vencimento')::date,
      data_liquidacao   = (p_payload->>'data_liquidacao')::date,
      status            = v_status,
      origem_tipo       = coalesce(p_payload->>'origem_tipo', origem_tipo),
      origem_id         = (p_payload->>'origem_id')::uuid,
      observacoes       = p_payload->>'observacoes'
    where c.id = (p_payload->>'id')::uuid
      and c.empresa_id = v_empresa
    returning c.id into v_id;
  else
    insert into public.financeiro_cobrancas_bancarias (
      empresa_id,
      conta_receber_id,
      cliente_id,
      conta_corrente_id,
      documento_ref,
      descricao,
      tipo_cobranca,
      nosso_numero,
      carteira_codigo,
      linha_digitavel,
      codigo_barras,
      pix_txid,
      pix_qr_code,
      url_pagamento,
      valor_original,
      valor_atual,
      data_emissao,
      data_vencimento,
      data_liquidacao,
      status,
      origem_tipo,
      origem_id,
      observacoes
    ) values (
      v_empresa,
      v_cr_id,
      v_cliente,
      v_cc_id,
      p_payload->>'documento_ref',
      p_payload->>'descricao',
      v_tipo,
      p_payload->>'nosso_numero',
      p_payload->>'carteira_codigo',
      p_payload->>'linha_digitavel',
      p_payload->>'codigo_barras',
      p_payload->>'pix_txid',
      p_payload->>'pix_qr_code',
      p_payload->>'url_pagamento',
      v_valor_orig,
      coalesce((p_payload->>'valor_atual')::numeric, v_valor_orig),
      (p_payload->>'data_emissao')::date,
      (p_payload->>'data_vencimento')::date,
      (p_payload->>'data_liquidacao')::date,
      v_status,
      p_payload->>'origem_tipo',
      (p_payload->>'origem_id')::uuid,
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_cobrancas_bancarias_upsert: ' || v_id
  );

  insert into public.financeiro_cobrancas_bancarias_eventos (
    empresa_id,
    cobranca_id,
    tipo_evento,
    status_novo,
    mensagem
  ) values (
    v_empresa,
    v_id,
    'status_change',
    v_status,
    'Cobrança criada/atualizada via upsert'
  );

  return public.financeiro_cobrancas_bancarias_get(v_id);
end;
$$;

revoke all on function public.financeiro_cobrancas_bancarias_upsert from public;
grant execute on function public.financeiro_cobrancas_bancarias_upsert to authenticated, service_role;

create or replace function public.financeiro_cobrancas_bancarias_delete(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_status  text;
begin
  select c.status
  into v_status
  from public.financeiro_cobrancas_bancarias c
  where c.id = p_id
    and c.empresa_id = v_empresa;

  if not found then
    raise exception 'Cobrança não encontrada ou acesso negado.';
  end if;

  if v_status in ('liquidada','baixada') then
    raise exception 'Cobrança % não pode ser excluída (status %). Cancele ou ajuste via financeiro.',
      p_id, v_status;
  end if;

  delete from public.financeiro_cobrancas_bancarias
  where id = p_id
    and empresa_id = v_empresa;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_cobrancas_bancarias_delete: ' || p_id
  );
end;
$$;

revoke all on function public.financeiro_cobrancas_bancarias_delete from public;
grant execute on function public.financeiro_cobrancas_bancarias_delete to authenticated, service_role;

create or replace function public.financeiro_cobrancas_bancarias_summary(
  p_start_venc date default null,
  p_end_venc   date default null,
  p_status     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa  uuid := public.current_empresa_id();
  v_pend     numeric;
  v_em_aberto numeric;
  v_liq      numeric;
  v_baix     numeric;
  v_erro     numeric;
begin
  select coalesce(sum(valor_atual),0)
  into v_pend
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status in ('pendente_emissao','emitida','registrada','enviada')
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  select coalesce(sum(valor_atual),0)
  into v_em_aberto
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status in ('pendente_emissao','emitida','registrada','enviada')
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  select coalesce(sum(valor_atual),0)
  into v_liq
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status = 'liquidada'
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  select coalesce(sum(valor_atual),0)
  into v_baix
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status = 'baixada'
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  select coalesce(sum(valor_atual),0)
  into v_erro
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status = 'erro'
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  return jsonb_build_object(
    'pendentes',  v_pend,
    'em_aberto',  v_em_aberto,
    'liquidadas', v_liq,
    'baixadas',   v_baix,
    'com_erro',   v_erro
  );
end;
$$;

revoke all on function public.financeiro_cobrancas_bancarias_summary from public;
grant execute on function public.financeiro_cobrancas_bancarias_summary to authenticated, service_role;

