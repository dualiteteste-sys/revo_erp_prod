/*
  PERF-DB-01 (P0): Índices/guard rails para top RPCs

  Contexto:
  - As RPCs principais usam filtros por `empresa_id`, status e ordenação por datas/números.
  - Sem índices dedicados, o p95 sobe e o sistema fica “pesado” com poucos registros.

  O que este migration faz (idempotente):
  - Cria índices btree para padrões de filtro/ordem em:
    - `vendas_pedidos` (vendas_list_pedidos)
    - `compras_pedidos` (compras_list_pedidos)
    - `financeiro_extratos_bancarios` (financeiro_extrato_bancario_list)
  - Cria índices de busca (GIN trgm) para `pessoas.nome` (partners/vendas search).

  Observação:
  - `pg_trgm` já é criada em `20260228008000_align_extensions_and_backup_bucket.sql`.
  - Índices usam `IF NOT EXISTS` para evitar drift e permitir reexecução.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Partners/Vendas: busca por nome (ILIKE %term%)
-- -----------------------------------------------------------------------------
create index if not exists idx_pessoas_empresa_nome_trgm
  on public.pessoas
  using gin (lower(nome) gin_trgm_ops)
  where deleted_at is null;

create index if not exists idx_pessoas_empresa_doc_unico
  on public.pessoas (empresa_id, doc_unico)
  where doc_unico is not null and deleted_at is null;

-- -----------------------------------------------------------------------------
-- Vendas (vendas_list_pedidos): empresa_id + status + ordem por data_emissao/numero
-- -----------------------------------------------------------------------------
create index if not exists idx_vendas_pedidos_empresa_data_numero
  on public.vendas_pedidos (empresa_id, data_emissao desc, numero desc);

create index if not exists idx_vendas_pedidos_empresa_status_data_numero
  on public.vendas_pedidos (empresa_id, status, data_emissao desc, numero desc);

-- -----------------------------------------------------------------------------
-- Compras (compras_list_pedidos): empresa_id + ordem por numero
-- -----------------------------------------------------------------------------
create index if not exists idx_compras_pedidos_empresa_numero
  on public.compras_pedidos (empresa_id, numero desc);

create index if not exists idx_compras_pedidos_empresa_status_numero
  on public.compras_pedidos (empresa_id, status, numero desc);

-- -----------------------------------------------------------------------------
-- Tesouraria (financeiro_extrato_bancario_list):
--   empresa_id + conta_corrente_id + data_lancamento + created_at
-- -----------------------------------------------------------------------------
create index if not exists idx_fin_extratos_empresa_conta_data
  on public.financeiro_extratos_bancarios (empresa_id, conta_corrente_id, data_lancamento asc, created_at asc, id asc);

create index if not exists idx_fin_extratos_empresa_data
  on public.financeiro_extratos_bancarios (empresa_id, data_lancamento asc, created_at asc, id asc);

select pg_notify('pgrst','reload schema');

COMMIT;

