-- ============================================================================
-- Serviços / Contratos (MVP2): Backfill de regra de cobrança (billing_rules)
-- ============================================================================
--
-- Objetivo:
-- - Para contratos já existentes (MVP), criar automaticamente uma regra default
--   em `public.servicos_contratos_billing_rules` quando ainda não existir.
-- - Idempotente: não altera regras já criadas.

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
select
  c.empresa_id,
  c.id,
  'mensal',
  (c.status = 'ativo'),
  coalesce(c.valor_mensal, 0),
  5,
  date_trunc('month', coalesce(c.data_inicio, current_date))::date,
  null
from public.servicos_contratos c
where not exists (
  select 1
  from public.servicos_contratos_billing_rules r
  where r.empresa_id = c.empresa_id
    and r.contrato_id = c.id
);

