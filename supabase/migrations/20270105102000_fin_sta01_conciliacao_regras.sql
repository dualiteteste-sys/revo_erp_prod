/*
  FIN-STA-01: Conciliação com matching sugerido + regras + auditoria

  Já existe:
  - Import de extrato + conciliação (vincular/desvincular) + sugestões por valor/data.

  Este complemento adiciona:
  - Regras simples de conciliação para reduzir retrabalho:
    - match por descrição (contains)
    - tipo (crédito/débito)
    - opcional: faixa de valor
    - campos sugeridos para criação de movimentação (categoria/centro de custo/descrição/observações)

  Auditoria:
  - Se `audit_logs` existir, habilita trigger de auditoria na tabela de regras.
*/

begin;

create table if not exists public.financeiro_conciliacao_regras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  conta_corrente_id uuid null references public.financeiro_contas_correntes(id) on delete cascade,
  tipo_lancamento text not null check (tipo_lancamento in ('credito','debito')),
  match_text text not null,
  min_valor numeric(15,2) null,
  max_valor numeric(15,2) null,
  categoria text null,
  centro_custo text null,
  descricao_override text null,
  observacoes text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_conc_regras_empresa_conta_ativo
  on public.financeiro_conciliacao_regras (empresa_id, conta_corrente_id, ativo);

create index if not exists idx_fin_conc_regras_empresa_tipo
  on public.financeiro_conciliacao_regras (empresa_id, tipo_lancamento);

drop trigger if exists tg_fin_conc_regras_set_updated_at on public.financeiro_conciliacao_regras;
create trigger tg_fin_conc_regras_set_updated_at
before update on public.financeiro_conciliacao_regras
for each row execute function public.tg_set_updated_at();

alter table public.financeiro_conciliacao_regras enable row level security;

drop policy if exists sel_fin_conc_regras_by_empresa on public.financeiro_conciliacao_regras;
create policy sel_fin_conc_regras_by_empresa
  on public.financeiro_conciliacao_regras
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_fin_conc_regras_same_empresa on public.financeiro_conciliacao_regras;
create policy ins_fin_conc_regras_same_empresa
  on public.financeiro_conciliacao_regras
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists upd_fin_conc_regras_same_empresa on public.financeiro_conciliacao_regras;
create policy upd_fin_conc_regras_same_empresa
  on public.financeiro_conciliacao_regras
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_fin_conc_regras_same_empresa on public.financeiro_conciliacao_regras;
create policy del_fin_conc_regras_same_empresa
  on public.financeiro_conciliacao_regras
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- Permissões SQL (evita 403 do PostgREST)
grant select, insert, update, delete on table public.financeiro_conciliacao_regras to authenticated;

-- Auditoria (quando disponível)
do $$
begin
  if to_regclass('public.audit_logs') is null or to_regprocedure('public.process_audit_log()') is null then
    return;
  end if;

  execute 'drop trigger if exists audit_logs_trigger on public.financeiro_conciliacao_regras';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.financeiro_conciliacao_regras for each row execute function public.process_audit_log()';
end;
$$;

select pg_notify('pgrst','reload schema');

commit;

