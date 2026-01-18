import type { SupabaseClient } from '@supabase/supabase-js';

export type CheckStatus = 'ok' | 'warn' | 'missing';

export type OnboardingCheck = {
  key: string;
  title: string;
  description: string;
  status: CheckStatus;
  actionLabel: string;
  actionHref: string;
};

export type OnboardingChecksResult = {
  checks: OnboardingCheck[];
  progress: { ok: number; total: number };
};

export async function fetchOnboardingChecks(
  supabase: SupabaseClient,
  empresaId: string
): Promise<OnboardingChecksResult> {
  // Preferência: status consolidado via RPC (evita múltiplos HEAD/GET que podem falhar por RLS).
  // Mantém fallback para queries diretas (DEV/local) caso a RPC ainda não exista.
  try {
    const { data, error } = await supabase.rpc('onboarding_checks_for_current_empresa');
    if (!error && data && typeof data === 'object') {
      const checks = Array.isArray((data as any).checks) ? ((data as any).checks as OnboardingCheck[]) : [];
      const progress = (data as any).progress as { ok: number; total: number } | undefined;
      if (checks.length > 0 && progress?.total) {
        return { checks, progress };
      }
    }
  } catch {
    // ignore and fallback
  }

  const [ccList, nfeEmitente, nfeNumeracao, centros] = await Promise.all([
    supabase.rpc('financeiro_contas_correntes_list', { p_q: null, p_limit: 200 }),
    supabase.rpc('fiscal_nfe_emitente_get'),
    supabase.rpc('fiscal_nfe_numeracoes_list'),
    supabase.rpc('financeiro_centros_custos_list', { p_q: null, p_tipo: null, p_limit: 1 }),
  ]);

  const contas = Array.isArray(ccList.data) ? (ccList.data as any[]) : [];
  const hasContaCorrente = !ccList.error && contas.length > 0;
  const hasPadraoReceb = contas.some((c) => !!c?.padrao_para_recebimentos);
  const hasPadraoPag = contas.some((c) => !!c?.padrao_para_pagamentos);
  const hasEmitente = !nfeEmitente.error && !!(nfeEmitente.data as any)?.empresa_id;
  const hasNumeracao = !nfeNumeracao.error && Array.isArray(nfeNumeracao.data) && nfeNumeracao.data.length > 0;
  const hasCentros = !centros.error && Array.isArray(centros.data) && centros.data.length > 0;

  const checks: OnboardingCheck[] = [
    {
      key: 'tesouraria.contas_correntes',
      title: 'Contas Correntes',
      description: hasContaCorrente ? 'Ok: já existe pelo menos 1 conta.' : 'Cadastre pelo menos 1 conta corrente (Caixa/Banco).',
      status: hasContaCorrente ? 'ok' : 'missing',
      actionLabel: 'Abrir Tesouraria',
      actionHref: '/app/financeiro/tesouraria',
    },
    {
      key: 'tesouraria.padrao_recebimentos',
      title: 'Conta padrão (Recebimentos)',
      description: hasPadraoReceb ? 'Ok: há conta padrão para recebimentos.' : 'Defina uma conta padrão para recebimentos (para baixar títulos).',
      status: hasPadraoReceb ? 'ok' : hasContaCorrente ? 'warn' : 'missing',
      actionLabel: 'Definir na Tesouraria',
      actionHref: '/app/financeiro/tesouraria',
    },
    {
      key: 'tesouraria.padrao_pagamentos',
      title: 'Conta padrão (Pagamentos)',
      description: hasPadraoPag ? 'Ok: há conta padrão para pagamentos.' : 'Defina uma conta padrão para pagamentos (para pagar títulos).',
      status: hasPadraoPag ? 'ok' : hasContaCorrente ? 'warn' : 'missing',
      actionLabel: 'Definir na Tesouraria',
      actionHref: '/app/financeiro/tesouraria',
    },
    {
      key: 'financeiro.centros_de_custo',
      title: 'Centro de Custo',
      description: hasCentros ? 'Ok: já existe pelo menos 1 centro de custo.' : 'Cadastre centros de custo para relatórios e auditoria.',
      status: hasCentros ? 'ok' : 'warn',
      actionLabel: 'Abrir Centros de Custo',
      actionHref: '/app/financeiro/centros-de-custo',
    },
    {
      key: 'fiscal.nfe.emitente',
      title: 'NF-e: Emitente',
      description: hasEmitente ? 'Ok: emitente configurado.' : 'Cadastre os dados do emitente para emitir NF-e.',
      status: hasEmitente ? 'ok' : 'warn',
      actionLabel: 'Configurar NF-e',
      actionHref: '/app/fiscal/nfe/configuracoes',
    },
    {
      key: 'fiscal.nfe.numeracao',
      title: 'NF-e: Numeração',
      description: hasNumeracao ? 'Ok: série/numeração configurada.' : 'Configure série/numeração para emitir NF-e.',
      status: hasNumeracao ? 'ok' : 'warn',
      actionLabel: 'Configurar NF-e',
      actionHref: '/app/fiscal/nfe/configuracoes',
    },
  ];

  const progress = { ok: checks.filter((c) => c.status === 'ok').length, total: checks.length };
  return { checks, progress };
}
