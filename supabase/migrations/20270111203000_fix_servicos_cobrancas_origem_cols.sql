-- ============================================================================
-- FIX: Serviços / Cobranças — colunas de origem para idempotência
-- ============================================================================
--
-- Bug:
--   RPC `servicos_contratos_billing_generate_receivables` insere em
--   `public.servicos_cobrancas` usando `origem_tipo`/`origem_id`/`observacoes`,
--   mas a tabela (MVP) não tinha essas colunas em alguns ambientes.
--   Resultado: HTTP 400 (42703) "column origem_tipo ... does not exist".
--
-- Fix:
--   Adiciona colunas de origem + índice UNIQUE (parcial) para idempotência.
--

begin;

alter table public.servicos_cobrancas
  add column if not exists origem_tipo text,
  add column if not exists origem_id uuid,
  add column if not exists observacoes text;

-- Idempotência: 1 cobrança por (empresa + origem_tipo + origem_id)
create unique index if not exists idx_servicos_cobrancas_empresa_origem_uniq
  on public.servicos_cobrancas (empresa_id, origem_tipo, origem_id)
  where origem_tipo is not null and origem_id is not null;

-- PostgREST: garante que o schema cache reflita as novas colunas/índices
select pg_notify('pgrst', 'reload schema');

commit;

