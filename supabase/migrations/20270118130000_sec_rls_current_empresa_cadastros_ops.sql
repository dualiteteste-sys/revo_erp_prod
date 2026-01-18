-- Estado da Arte (RLS / Multi-tenant):
-- - Tabelas com `empresa_id` devem isolar pelo tenant ativo (`current_empresa_id()`),
--   evitando que usuários com múltiplas empresas vejam dados "fora da empresa ativa".
-- - Tabelas internas/sensíveis que não devem ser acessadas pelo client devem ter grants revogados
--   (acesso somente via RPCs/Edge Functions com service_role).

begin;

-- ---------------------------------------------------------------------
-- Cadastros: Unidades de Medida
-- Mantém leitura de registros padrão (`empresa_id is null`) + tenant atual.
-- Escrita somente dentro do tenant atual.
-- ---------------------------------------------------------------------
drop policy if exists "Enable read access for authenticated users" on public.unidades_medida;
drop policy if exists "Enable insert for authenticated users" on public.unidades_medida;
drop policy if exists "Enable update for authenticated users" on public.unidades_medida;
drop policy if exists "Enable delete for authenticated users" on public.unidades_medida;

create policy "sec01_unidades_medida_select_current_empresa"
on public.unidades_medida
for select
to authenticated
using (
  empresa_id is null
  or empresa_id = public.current_empresa_id()
);

create policy "sec01_unidades_medida_insert_current_empresa"
on public.unidades_medida
for insert
to authenticated
with check (
  empresa_id = public.current_empresa_id()
);

create policy "sec01_unidades_medida_update_current_empresa"
on public.unidades_medida
for update
to authenticated
using (
  empresa_id = public.current_empresa_id()
)
with check (
  empresa_id = public.current_empresa_id()
);

create policy "sec01_unidades_medida_delete_current_empresa"
on public.unidades_medida
for delete
to authenticated
using (
  empresa_id = public.current_empresa_id()
);

-- ---------------------------------------------------------------------
-- Cadastros: Embalagens
-- Mantém leitura de registros padrão (`empresa_id is null`) + tenant atual.
-- ---------------------------------------------------------------------
drop policy if exists "Enable read access for authenticated users" on public.embalagens;
drop policy if exists "Enable insert for authenticated users" on public.embalagens;
drop policy if exists "Enable update for authenticated users" on public.embalagens;
drop policy if exists "Enable delete for authenticated users" on public.embalagens;

create policy "sec01_embalagens_select_current_empresa"
on public.embalagens
for select
to authenticated
using (
  empresa_id is null
  or empresa_id = public.current_empresa_id()
);

create policy "sec01_embalagens_insert_current_empresa"
on public.embalagens
for insert
to authenticated
with check (
  empresa_id = public.current_empresa_id()
);

create policy "sec01_embalagens_update_current_empresa"
on public.embalagens
for update
to authenticated
using (
  empresa_id = public.current_empresa_id()
)
with check (
  empresa_id = public.current_empresa_id()
);

create policy "sec01_embalagens_delete_current_empresa"
on public.embalagens
for delete
to authenticated
using (
  empresa_id = public.current_empresa_id()
);

-- ---------------------------------------------------------------------
-- Indústria/PCP: restringir policies ao tenant ativo.
-- ---------------------------------------------------------------------
drop policy if exists sec01_industria_ct_aps_config_select on public.industria_ct_aps_config;
drop policy if exists sec01_industria_ct_aps_config_insert on public.industria_ct_aps_config;
drop policy if exists sec01_industria_ct_aps_config_update on public.industria_ct_aps_config;
drop policy if exists sec01_industria_ct_aps_config_delete on public.industria_ct_aps_config;

create policy sec01_industria_ct_aps_config_select
on public.industria_ct_aps_config
for select
to authenticated
using (empresa_id = public.current_empresa_id());

create policy sec01_industria_ct_aps_config_insert
on public.industria_ct_aps_config
for insert
to authenticated
with check (empresa_id = public.current_empresa_id());

create policy sec01_industria_ct_aps_config_update
on public.industria_ct_aps_config
for update
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

create policy sec01_industria_ct_aps_config_delete
on public.industria_ct_aps_config
for delete
to authenticated
using (empresa_id = public.current_empresa_id());

drop policy if exists sec01_industria_ct_calendario_semana_select on public.industria_ct_calendario_semana;
drop policy if exists sec01_industria_ct_calendario_semana_insert on public.industria_ct_calendario_semana;
drop policy if exists sec01_industria_ct_calendario_semana_update on public.industria_ct_calendario_semana;
drop policy if exists sec01_industria_ct_calendario_semana_delete on public.industria_ct_calendario_semana;

create policy sec01_industria_ct_calendario_semana_select
on public.industria_ct_calendario_semana
for select
to authenticated
using (empresa_id = public.current_empresa_id());

create policy sec01_industria_ct_calendario_semana_insert
on public.industria_ct_calendario_semana
for insert
to authenticated
with check (empresa_id = public.current_empresa_id());

create policy sec01_industria_ct_calendario_semana_update
on public.industria_ct_calendario_semana
for update
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

create policy sec01_industria_ct_calendario_semana_delete
on public.industria_ct_calendario_semana
for delete
to authenticated
using (empresa_id = public.current_empresa_id());

drop policy if exists sec01_pcp_aps_runs_select on public.pcp_aps_runs;
drop policy if exists sec01_pcp_aps_runs_insert on public.pcp_aps_runs;
drop policy if exists sec01_pcp_aps_runs_update on public.pcp_aps_runs;
drop policy if exists sec01_pcp_aps_runs_delete on public.pcp_aps_runs;

create policy sec01_pcp_aps_runs_select
on public.pcp_aps_runs
for select
to authenticated
using (empresa_id = public.current_empresa_id());

create policy sec01_pcp_aps_runs_insert
on public.pcp_aps_runs
for insert
to authenticated
with check (empresa_id = public.current_empresa_id());

create policy sec01_pcp_aps_runs_update
on public.pcp_aps_runs
for update
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

create policy sec01_pcp_aps_runs_delete
on public.pcp_aps_runs
for delete
to authenticated
using (empresa_id = public.current_empresa_id());

drop policy if exists sec01_pcp_aps_run_changes_select on public.pcp_aps_run_changes;
drop policy if exists sec01_pcp_aps_run_changes_insert on public.pcp_aps_run_changes;
drop policy if exists sec01_pcp_aps_run_changes_update on public.pcp_aps_run_changes;
drop policy if exists sec01_pcp_aps_run_changes_delete on public.pcp_aps_run_changes;

create policy sec01_pcp_aps_run_changes_select
on public.pcp_aps_run_changes
for select
to authenticated
using (empresa_id = public.current_empresa_id());

create policy sec01_pcp_aps_run_changes_insert
on public.pcp_aps_run_changes
for insert
to authenticated
with check (empresa_id = public.current_empresa_id());

create policy sec01_pcp_aps_run_changes_update
on public.pcp_aps_run_changes
for update
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

create policy sec01_pcp_aps_run_changes_delete
on public.pcp_aps_run_changes
for delete
to authenticated
using (empresa_id = public.current_empresa_id());

-- ---------------------------------------------------------------------
-- Tabelas internas/sensíveis: retirar acesso direto do client (authenticated/anon).
-- Mantém acesso via service_role (Edge/RPC SECURITY DEFINER).
-- ---------------------------------------------------------------------
revoke all on table public.ecommerce_connection_secrets from authenticated, anon;
revoke all on table public.integration_circuit_breakers from authenticated, anon;
revoke all on table public.integration_rate_limit_counters from authenticated, anon;
revoke all on table public.idempotency_keys from authenticated, anon;
revoke all on table public.vendas_automacao_jobs from authenticated, anon;

commit;

