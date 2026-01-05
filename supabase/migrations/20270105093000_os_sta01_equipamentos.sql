/*
  OS-STA-01: Cadastro de equipamento (assistência técnica)

  Objetivo:
  - Permitir vincular um equipamento do cliente à Ordem de Serviço (OS) para registrar:
    modelo, número de série, IMEI, acessórios e garantia.

  Notas:
  - Fotos podem ser anexadas como `os_docs` na própria OS (já existe upload/Storage).
  - Esta migration cria a entidade de equipamento e adiciona `equipamento_id` em `ordem_servicos`.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabela: os_equipamentos
-- -----------------------------------------------------------------------------
create table if not exists public.os_equipamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cliente_id uuid null references public.pessoas(id) on delete set null,
  modelo text not null,
  numero_serie text null,
  imei text null,
  acessorios text null,
  garantia_ate date null,
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_os_equipamentos_empresa_cliente_updated
  on public.os_equipamentos (empresa_id, cliente_id, updated_at desc);

create index if not exists idx_os_equipamentos_empresa_modelo
  on public.os_equipamentos (empresa_id, modelo);

create unique index if not exists ux_os_equipamentos_empresa_serie
  on public.os_equipamentos (empresa_id, numero_serie)
  where numero_serie is not null and btrim(numero_serie) <> '';

create unique index if not exists ux_os_equipamentos_empresa_imei
  on public.os_equipamentos (empresa_id, imei)
  where imei is not null and btrim(imei) <> '';

drop trigger if exists tg_os_equipamentos_set_updated_at on public.os_equipamentos;
create trigger tg_os_equipamentos_set_updated_at
before update on public.os_equipamentos
for each row execute function public.tg_set_updated_at();

alter table public.os_equipamentos enable row level security;

drop policy if exists sel_os_equipamentos_by_empresa on public.os_equipamentos;
create policy sel_os_equipamentos_by_empresa
  on public.os_equipamentos
  for select
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_equipamentos_same_empresa on public.os_equipamentos;
create policy ins_os_equipamentos_same_empresa
  on public.os_equipamentos
  for insert
  with check (empresa_id = public.current_empresa_id());

drop policy if exists upd_os_equipamentos_same_empresa on public.os_equipamentos;
create policy upd_os_equipamentos_same_empresa
  on public.os_equipamentos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_os_equipamentos_same_empresa on public.os_equipamentos;
create policy del_os_equipamentos_same_empresa
  on public.os_equipamentos
  for delete
  using (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- 2) Coluna de vínculo na OS
-- -----------------------------------------------------------------------------
alter table public.ordem_servicos
  add column if not exists equipamento_id uuid null references public.os_equipamentos(id) on delete set null;

create index if not exists idx_ordem_servicos_empresa_equipamento
  on public.ordem_servicos (empresa_id, equipamento_id);

-- -----------------------------------------------------------------------------
-- 3) Persistir via RPCs (unsafe) para compat com RBAC wrappers
-- -----------------------------------------------------------------------------
create or replace function public.create_os_for_current_user__unsafe(payload jsonb)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  rec public.ordem_servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][CREATE_OS] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  insert into public.ordem_servicos (
    empresa_id,
    numero,
    cliente_id,
    equipamento_id,
    status,
    descricao,
    consideracoes_finais,
    data_inicio,
    data_prevista,
    hora,
    data_conclusao,
    desconto_valor,
    vendedor,
    comissao_percentual,
    comissao_valor,
    tecnico,
    orcar,
    forma_recebimento,
    meio,
    conta_bancaria,
    categoria_financeira,
    condicao_pagamento,
    observacoes,
    observacoes_internas,
    anexos,
    marcadores,
    ordem,
    custo_estimado,
    custo_real
  )
  values (
    v_empresa_id,
    coalesce(nullif(payload->>'numero','')::bigint, public.next_os_number_for_current_empresa()),
    nullif(payload->>'cliente_id','')::uuid,
    nullif(payload->>'equipamento_id','')::uuid,
    coalesce(nullif(payload->>'status','')::public.status_os, 'orcamento'),
    nullif(payload->>'descricao',''),
    nullif(payload->>'consideracoes_finais',''),
    nullif(payload->>'data_inicio','')::date,
    nullif(payload->>'data_prevista','')::date,
    nullif(payload->>'hora','')::time,
    nullif(payload->>'data_conclusao','')::date,
    coalesce(nullif(payload->>'desconto_valor','')::numeric, 0),
    nullif(payload->>'vendedor',''),
    nullif(payload->>'comissao_percentual','')::numeric,
    nullif(payload->>'comissao_valor','')::numeric,
    nullif(payload->>'tecnico',''),
    coalesce(nullif(payload->>'orcar','')::boolean, false),
    nullif(payload->>'forma_recebimento',''),
    nullif(payload->>'meio',''),
    nullif(payload->>'conta_bancaria',''),
    nullif(payload->>'categoria_financeira',''),
    nullif(payload->>'condicao_pagamento',''),
    nullif(payload->>'observacoes',''),
    nullif(payload->>'observacoes_internas',''),
    case when payload ? 'anexos' then array(select jsonb_array_elements_text(payload->'anexos')) else null end,
    case when payload ? 'marcadores' then array(select jsonb_array_elements_text(payload->'marcadores')) else null end,
    nullif(payload->>'ordem','')::int,
    coalesce(nullif(payload->>'custo_estimado','')::numeric, 0),
    coalesce(nullif(payload->>'custo_real','')::numeric, 0)
  )
  returning * into rec;

  perform public.os_recalc_totals(rec.id);
  return rec;
end;
$$;

create or replace function public.update_os_for_current_user__unsafe(p_id uuid, payload jsonb)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  rec public.ordem_servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][UPDATE_OS] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  update public.ordem_servicos os
     set cliente_id            = case when payload ? 'cliente_id' then nullif(payload->>'cliente_id','')::uuid else os.cliente_id end,
         equipamento_id        = case when payload ? 'equipamento_id' then nullif(payload->>'equipamento_id','')::uuid else os.equipamento_id end,
         status                = coalesce(nullif(payload->>'status','')::public.status_os, os.status),
         descricao             = coalesce(nullif(payload->>'descricao',''), os.descricao),
         consideracoes_finais  = coalesce(nullif(payload->>'consideracoes_finais',''), os.consideracoes_finais),
         data_inicio           = case when payload ? 'data_inicio' then nullif(payload->>'data_inicio','')::date else os.data_inicio end,
         data_prevista         = case when payload ? 'data_prevista' then nullif(payload->>'data_prevista','')::date else os.data_prevista end,
         hora                  = case when payload ? 'hora' then nullif(payload->>'hora','')::time else os.hora end,
         data_conclusao        = case when payload ? 'data_conclusao' then nullif(payload->>'data_conclusao','')::date else os.data_conclusao end,
         desconto_valor        = coalesce(nullif(payload->>'desconto_valor','')::numeric, os.desconto_valor),
         vendedor              = coalesce(nullif(payload->>'vendedor',''), os.vendedor),
         comissao_percentual   = coalesce(nullif(payload->>'comissao_percentual','')::numeric, os.comissao_percentual),
         comissao_valor        = coalesce(nullif(payload->>'comissao_valor','')::numeric, os.comissao_valor),
         tecnico               = coalesce(nullif(payload->>'tecnico',''), os.tecnico),
         orcar                 = coalesce(nullif(payload->>'orcar','')::boolean, os.orcar),
         forma_recebimento     = coalesce(nullif(payload->>'forma_recebimento',''), os.forma_recebimento),
         condicao_pagamento    = coalesce(nullif(payload->>'condicao_pagamento',''), os.condicao_pagamento),
         observacoes           = coalesce(nullif(payload->>'observacoes',''), os.observacoes),
         observacoes_internas  = coalesce(nullif(payload->>'observacoes_internas',''), os.observacoes_internas),
         anexos                = case when payload ? 'anexos' then array(select jsonb_array_elements_text(payload->'anexos')) else os.anexos end,
         marcadores            = case when payload ? 'marcadores' then array(select jsonb_array_elements_text(payload->'marcadores')) else os.marcadores end,
         ordem                 = coalesce(nullif(payload->>'ordem','')::int, os.ordem),
         custo_estimado        = case when payload ? 'custo_estimado' then coalesce(nullif(payload->>'custo_estimado','')::numeric, 0) else os.custo_estimado end,
         custo_real            = case when payload ? 'custo_real' then coalesce(nullif(payload->>'custo_real','')::numeric, 0) else os.custo_real end,
         updated_at            = now()
   where os.id = p_id
     and os.empresa_id = v_empresa_id
  returning * into rec;

  if not found then
    raise exception '[RPC][UPDATE_OS] OS não encontrada na empresa atual' using errcode='P0002';
  end if;

  perform public.os_recalc_totals(p_id);
  return rec;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Auditoria (quando disponível)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.audit_logs') is null or to_regprocedure('public.process_audit_log()') is null then
    return;
  end if;

  execute 'drop trigger if exists audit_logs_trigger on public.os_equipamentos';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.os_equipamentos for each row execute function public.process_audit_log()';
end;
$$;

select pg_notify('pgrst','reload schema');

commit;

