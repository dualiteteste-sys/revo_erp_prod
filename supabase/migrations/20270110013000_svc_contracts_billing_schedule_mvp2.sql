-- ============================================================================
-- Serviços / Contratos (MVP2): Regras de cobrança + agenda (schedule) + geração
-- ============================================================================

-- Objetivo:
-- - Manter o MVP atual (`public.servicos_contratos`) e adicionar uma camada
--   “estado da arte” para faturamento:
--   - regra de cobrança (mensal/avulso)
--   - agenda (previsto) idempotente
--   - materialização em `public.contas_a_receber` (idempotente via origem_tipo/origem_id)

-- ----------------------------------------------------------------------------
-- 1) Tabelas
-- ----------------------------------------------------------------------------

create table if not exists public.servicos_contratos_billing_rules (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  contrato_id uuid not null references public.servicos_contratos(id) on delete cascade,
  tipo text not null default 'mensal' check (tipo in ('mensal','avulso')),
  ativo boolean not null default true,

  -- mensal
  valor_mensal numeric(15,2) not null default 0 check (valor_mensal >= 0),
  dia_vencimento int not null default 5 check (dia_vencimento between 1 and 28),
  primeira_competencia date not null default date_trunc('month', current_date)::date,

  -- opcional: vínculo financeiro
  centro_de_custo_id uuid null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint servicos_contratos_billing_rules_empresa_contrato_uk unique (empresa_id, contrato_id)
);

do $$
begin
  if to_regclass('public.financeiro_centros_custos') is not null then
    if not exists (
      select 1
      from information_schema.table_constraints tc
      where tc.table_schema='public'
        and tc.table_name='servicos_contratos_billing_rules'
        and tc.constraint_name='servicos_contratos_billing_rules_cc_fk'
    ) then
      alter table public.servicos_contratos_billing_rules
        add constraint servicos_contratos_billing_rules_cc_fk
        foreign key (centro_de_custo_id)
        references public.financeiro_centros_custos(id)
        on delete set null;
    end if;
  end if;
end $$;

create index if not exists idx_servicos_contratos_billing_rules_empresa on public.servicos_contratos_billing_rules(empresa_id);
create index if not exists idx_servicos_contratos_billing_rules_contrato on public.servicos_contratos_billing_rules(contrato_id);

alter table public.servicos_contratos_billing_rules enable row level security;
alter table public.servicos_contratos_billing_rules force row level security;

drop policy if exists servicos_contratos_billing_rules_all_company_members on public.servicos_contratos_billing_rules;
create policy servicos_contratos_billing_rules_all_company_members
on public.servicos_contratos_billing_rules
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_servicos_contratos_billing_rules_updated on public.servicos_contratos_billing_rules;
create trigger tg_servicos_contratos_billing_rules_updated
  before update on public.servicos_contratos_billing_rules
  for each row execute function public.tg_set_updated_at();


create table if not exists public.servicos_contratos_billing_schedule (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  contrato_id uuid not null references public.servicos_contratos(id) on delete cascade,
  rule_id uuid not null references public.servicos_contratos_billing_rules(id) on delete cascade,

  kind text not null default 'mensal' check (kind in ('mensal','avulso')),
  competencia date null,
  data_vencimento date not null,
  valor numeric(15,2) not null default 0 check (valor >= 0),
  status text not null default 'previsto' check (status in ('previsto','gerado','cancelado')),

  conta_a_receber_id uuid null references public.contas_a_receber(id) on delete set null,
  cobranca_id uuid null references public.servicos_cobrancas(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists svc_contracts_billing_schedule_mensal_uk
  on public.servicos_contratos_billing_schedule (empresa_id, contrato_id, kind, competencia)
  where kind = 'mensal' and competencia is not null;

create unique index if not exists svc_contracts_billing_schedule_avulso_uk
  on public.servicos_contratos_billing_schedule (empresa_id, contrato_id, kind, data_vencimento, valor)
  where kind = 'avulso';

create index if not exists idx_servicos_contratos_billing_schedule_empresa on public.servicos_contratos_billing_schedule(empresa_id);
create index if not exists idx_servicos_contratos_billing_schedule_contrato on public.servicos_contratos_billing_schedule(contrato_id);
create index if not exists idx_servicos_contratos_billing_schedule_due on public.servicos_contratos_billing_schedule(empresa_id, data_vencimento);

alter table public.servicos_contratos_billing_schedule enable row level security;
alter table public.servicos_contratos_billing_schedule force row level security;

drop policy if exists servicos_contratos_billing_schedule_all_company_members on public.servicos_contratos_billing_schedule;
create policy servicos_contratos_billing_schedule_all_company_members
on public.servicos_contratos_billing_schedule
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_servicos_contratos_billing_schedule_updated on public.servicos_contratos_billing_schedule;
create trigger tg_servicos_contratos_billing_schedule_updated
  before update on public.servicos_contratos_billing_schedule
  for each row execute function public.tg_set_updated_at();

grant all on table public.servicos_contratos_billing_rules, public.servicos_contratos_billing_schedule to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) RPCs (idempotentes)
-- ----------------------------------------------------------------------------

create or replace function public.servicos_contratos_billing_ensure_rule(p_contrato_id uuid)
returns public.servicos_contratos_billing_rules
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_contrato public.servicos_contratos;
  v_rule public.servicos_contratos_billing_rules;
begin
  perform public.require_permission_for_current_user('servicos','update');

  if v_empresa is null then
    raise exception '[SVC][CONTRATOS][BILLING] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_contrato
  from public.servicos_contratos c
  where c.id = p_contrato_id
    and c.empresa_id = v_empresa;

  if not found then
    raise exception 'Contrato não encontrado ou acesso negado.' using errcode='P0002';
  end if;

  select * into v_rule
  from public.servicos_contratos_billing_rules r
  where r.empresa_id = v_empresa
    and r.contrato_id = p_contrato_id;

  if found then
    return v_rule;
  end if;

  insert into public.servicos_contratos_billing_rules (
    empresa_id,
    contrato_id,
    tipo,
    ativo,
    valor_mensal,
    dia_vencimento,
    primeira_competencia,
    centro_de_custo_id
  )
  values (
    v_empresa,
    p_contrato_id,
    'mensal',
    true,
    coalesce(v_contrato.valor_mensal, 0),
    5,
    date_trunc('month', coalesce(v_contrato.data_inicio, current_date))::date,
    null
  )
  returning * into v_rule;

  return v_rule;
end;
$$;

revoke all on function public.servicos_contratos_billing_ensure_rule(uuid) from public, anon;
grant execute on function public.servicos_contratos_billing_ensure_rule(uuid) to authenticated, service_role;


create or replace function public.servicos_contratos_billing_generate_schedule(
  p_contrato_id uuid,
  p_months_ahead int default 12
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_rule public.servicos_contratos_billing_rules;
  v_contrato public.servicos_contratos;
  v_start date;
  v_i int;
  v_comp date;
  v_due date;
  v_inserted int := 0;
begin
  perform public.require_permission_for_current_user('servicos','update');

  if v_empresa is null then
    raise exception '[SVC][CONTRATOS][BILLING] empresa_id inválido' using errcode='42501';
  end if;

  if p_months_ahead is null or p_months_ahead < 1 or p_months_ahead > 36 then
    raise exception 'months_ahead inválido (1..36).';
  end if;

  select * into v_contrato
  from public.servicos_contratos c
  where c.id = p_contrato_id
    and c.empresa_id = v_empresa;

  if not found then
    raise exception 'Contrato não encontrado ou acesso negado.' using errcode='P0002';
  end if;

  select public.servicos_contratos_billing_ensure_rule(p_contrato_id) into v_rule;
  v_start := coalesce(v_rule.primeira_competencia, date_trunc('month', coalesce(v_contrato.data_inicio, current_date))::date);
  v_start := date_trunc('month', v_start)::date;

  if v_rule.tipo = 'mensal' then
    for v_i in 0..(p_months_ahead - 1) loop
      v_comp := (v_start + (v_i || ' months')::interval)::date;
      v_comp := date_trunc('month', v_comp)::date;
      v_due := (date_trunc('month', v_comp)::date + ((v_rule.dia_vencimento - 1) || ' days')::interval)::date;

      insert into public.servicos_contratos_billing_schedule (
        empresa_id,
        contrato_id,
        rule_id,
        kind,
        competencia,
        data_vencimento,
        valor,
        status
      )
      values (
        v_empresa,
        p_contrato_id,
        v_rule.id,
        'mensal',
        v_comp,
        v_due,
        coalesce(v_rule.valor_mensal, 0),
        'previsto'
      )
      on conflict do nothing;

      if found then
        v_inserted := v_inserted + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'tipo', v_rule.tipo,
    'months_ahead', p_months_ahead
  );
end;
$$;

revoke all on function public.servicos_contratos_billing_generate_schedule(uuid, int) from public, anon;
grant execute on function public.servicos_contratos_billing_generate_schedule(uuid, int) to authenticated, service_role;


create or replace function public.servicos_contratos_billing_generate_receivables(
  p_contrato_id uuid,
  p_until date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_contrato public.servicos_contratos;
  v_rule public.servicos_contratos_billing_rules;
  v_row public.servicos_contratos_billing_schedule;
  v_receber public.contas_a_receber;
  v_cobranca public.servicos_cobrancas;
  v_created int := 0;
begin
  perform public.require_permission_for_current_user('servicos','update');
  perform public.require_permission_for_current_user('contas_a_receber','create');

  if v_empresa is null then
    raise exception '[SVC][CONTRATOS][BILLING] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_contrato
  from public.servicos_contratos c
  where c.id = p_contrato_id
    and c.empresa_id = v_empresa;

  if not found then
    raise exception 'Contrato não encontrado ou acesso negado.' using errcode='P0002';
  end if;

  if v_contrato.status <> 'ativo' then
    return jsonb_build_object('ok', true, 'created', 0, 'reason', 'contrato_nao_ativo');
  end if;

  select public.servicos_contratos_billing_ensure_rule(p_contrato_id) into v_rule;
  perform public.servicos_contratos_billing_generate_schedule(p_contrato_id, 12);

  for v_row in
    select *
    from public.servicos_contratos_billing_schedule s
    where s.empresa_id = v_empresa
      and s.contrato_id = p_contrato_id
      and s.status = 'previsto'
      and s.conta_a_receber_id is null
      and s.data_vencimento <= coalesce(p_until, current_date)
    order by s.data_vencimento asc
  loop
    if v_contrato.cliente_id is null then
      raise exception 'Contrato não possui cliente vinculado. Não é possível gerar contas a receber.';
    end if;

    begin
      insert into public.contas_a_receber (
        empresa_id,
        cliente_id,
        descricao,
        valor,
        data_vencimento,
        status,
        origem_tipo,
        origem_id,
        centro_de_custo_id,
        observacoes
      )
      values (
        v_empresa,
        v_contrato.cliente_id,
        format('Contrato %s - %s (%s)', coalesce(v_contrato.numero,'(s/n)'), left(coalesce(v_contrato.descricao,''), 80), to_char(coalesce(v_row.competencia, v_row.data_vencimento), 'YYYY-MM')),
        coalesce(v_row.valor, 0),
        v_row.data_vencimento,
        'pendente'::public.status_conta_receber,
        'SERVICO_CONTRATO_SCHEDULE',
        v_row.id,
        v_rule.centro_de_custo_id,
        'Gerado automaticamente a partir de contrato de serviços.'
      )
      returning * into v_receber;
    exception
      when unique_violation then
        select * into v_receber
        from public.contas_a_receber c
        where c.empresa_id = v_empresa
          and c.origem_tipo = 'SERVICO_CONTRATO_SCHEDULE'
          and c.origem_id = v_row.id
        limit 1;
    end;

    insert into public.servicos_cobrancas (
      empresa_id,
      nota_id,
      cliente_id,
      data_vencimento,
      valor,
      status,
      conta_a_receber_id
    )
    values (
      v_empresa,
      null,
      v_contrato.cliente_id,
      v_row.data_vencimento,
      coalesce(v_row.valor, 0),
      'pendente',
      v_receber.id
    )
    returning * into v_cobranca;

    update public.servicos_contratos_billing_schedule s
    set
      status = 'gerado',
      conta_a_receber_id = v_receber.id,
      cobranca_id = v_cobranca.id
    where s.id = v_row.id
      and s.empresa_id = v_empresa;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('ok', true, 'created', v_created);
end;
$$;

revoke all on function public.servicos_contratos_billing_generate_receivables(uuid, date) from public, anon;
grant execute on function public.servicos_contratos_billing_generate_receivables(uuid, date) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

