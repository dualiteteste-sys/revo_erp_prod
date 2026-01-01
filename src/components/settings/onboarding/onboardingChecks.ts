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

  const [
    ccAny,
    ccRec,
    ccPag,
    nfeEmitente,
    nfeNumeracao,
    centrosCusto,
  ] = await Promise.all([
    supabase
      .from('financeiro_contas_correntes')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId),
    supabase
      .from('financeiro_contas_correntes')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('padrao_para_recebimentos', true)
      .limit(1),
    supabase
      .from('financeiro_contas_correntes')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('padrao_para_pagamentos', true)
      .limit(1),
    supabase.from('fiscal_nfe_emitente').select('empresa_id').eq('empresa_id', empresaId).maybeSingle(),
    supabase.from('fiscal_nfe_numeracao').select('empresa_id').eq('empresa_id', empresaId).maybeSingle(),
    supabase.from('centros_de_custo').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
  ]);

  const hasContaCorrente = !ccAny.error && (ccAny.count ?? 0) > 0;
  const hasPadraoReceb = !ccRec.error && (ccRec.data?.length ?? 0) > 0;
  const hasPadraoPag = !ccPag.error && (ccPag.data?.length ?? 0) > 0;
  const hasEmitente = !nfeEmitente.error && !!nfeEmitente.data?.empresa_id;
  const hasNumeracao = !nfeNumeracao.error && !!nfeNumeracao.data?.empresa_id;
  const hasCentros = !centrosCusto.error && (centrosCusto.count ?? 0) > 0;

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
