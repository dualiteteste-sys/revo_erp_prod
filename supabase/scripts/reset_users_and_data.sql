-- DANGER: This script deletes data!
-- Use this to reset your development database to a clean state (users and business data).

BEGIN;

-- 1. Truncate business tables (using CASCADE to handle foreign keys)
-- Add any other tables you want to clear here.
TRUNCATE TABLE 
  public.estoque_movimentos,
  public.estoque_saldos,
  public.industria_ordens,
  public.industria_producao_ordens,
  public.industria_benef_ordens,
  public.industria_benef_entregas,
  public.industria_benef_componentes,
  public.industria_boms,
  public.industria_boms_componentes,
  public.industria_materiais_cliente,
  public.industria_centros_trabalho,
  public.industria_operacoes,
  public.compras_pedidos,
  public.compras_itens,
  public.vendas_pedidos,
  public.financeiro_movimentacoes,
  public.financeiro_contas_pagar,
  public.contas_a_receber,
  public.financeiro_cobrancas_bancarias,
  public.crm_oportunidades,
  public.crm_etapas,
  public.crm_funis,
  public.empresa_usuarios,
  public.empresas
CASCADE;

-- 2. Delete users from Supabase Auth
-- This requires high privileges (postgres or service_role).
-- In local development, this usually works fine.
DELETE FROM auth.users;

COMMIT;
