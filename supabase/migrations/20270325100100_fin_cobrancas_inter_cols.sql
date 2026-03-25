/*
  # Financeiro — Colunas Inter na tabela de cobranças bancárias

  ## Descrição
  Adiciona colunas para rastrear integração com Banco Inter:
  - provider: identifica origem ('manual', 'inter', etc.)
  - inter_codigo_solicitacao: código retornado pela API Inter (V3)
  - inter_situacao: situação reportada pelo Inter (A_RECEBER, PAGO, etc.)

  ## Impact Summary
  - Segurança: ADD COLUMN IF NOT EXISTS (idempotente)
  - Performance: índice parcial em inter_codigo_solicitacao
*/

-- Coluna provider (identifica se boleto foi registrado manualmente ou via API)
ALTER TABLE public.financeiro_cobrancas_bancarias
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual';

-- Código de solicitação retornado pela API Inter V3
ALTER TABLE public.financeiro_cobrancas_bancarias
  ADD COLUMN IF NOT EXISTS inter_codigo_solicitacao text;

-- Situação reportada pelo Inter (A_RECEBER, PAGO, CANCELADO, EXPIRADO, VENCIDO)
ALTER TABLE public.financeiro_cobrancas_bancarias
  ADD COLUMN IF NOT EXISTS inter_situacao text;

-- Índice parcial para busca rápida de cobranças Inter
CREATE INDEX IF NOT EXISTS idx_fin_cobr_inter_cod
  ON public.financeiro_cobrancas_bancarias(inter_codigo_solicitacao)
  WHERE inter_codigo_solicitacao IS NOT NULL;

-- Índice para webhook lookup (provider + inter_codigo_solicitacao identifica registro único)
CREATE INDEX IF NOT EXISTS idx_fin_cobr_provider
  ON public.financeiro_cobrancas_bancarias(provider)
  WHERE provider <> 'manual';
