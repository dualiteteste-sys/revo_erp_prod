import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Button } from '@/components/ui/button';

type CheckStatus = 'ok' | 'warn' | 'missing';

type CheckItem = {
  title: string;
  description: string;
  status: CheckStatus;
  actionLabel: string;
  actionHref: string;
};

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'ok') return <CheckCircle2 className="text-emerald-600" size={18} />;
  if (status === 'warn') return <Circle className="text-amber-600" size={18} />;
  return <XCircle className="text-rose-600" size={18} />;
}

export default function OnboardingChecklistPage() {
  const supabase = useSupabase();
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<CheckItem[]>([]);

  const empresaId = activeEmpresa?.id ?? null;

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [
        ccAny,
        ccRec,
        ccPag,
        nfeEmitente,
        nfeNumeracao,
        centrosCusto,
      ] = await Promise.all([
        supabase.from('financeiro_contas_correntes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
        supabase.from('financeiro_contas_correntes').select('id').eq('empresa_id', empresaId).eq('padrao_para_recebimentos', true).limit(1),
        supabase.from('financeiro_contas_correntes').select('id').eq('empresa_id', empresaId).eq('padrao_para_pagamentos', true).limit(1),
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

      const next: CheckItem[] = [
        {
          title: 'Contas Correntes',
          description: hasContaCorrente ? 'Ok: já existe pelo menos 1 conta.' : 'Cadastre pelo menos 1 conta corrente (Caixa/Banco).',
          status: hasContaCorrente ? 'ok' : 'missing',
          actionLabel: 'Abrir Tesouraria',
          actionHref: '/app/financeiro/tesouraria',
        },
        {
          title: 'Conta padrão (Recebimentos)',
          description: hasPadraoReceb ? 'Ok: há conta padrão para recebimentos.' : 'Defina uma conta padrão para recebimentos (para baixar títulos).',
          status: hasPadraoReceb ? 'ok' : hasContaCorrente ? 'warn' : 'missing',
          actionLabel: 'Definir na Tesouraria',
          actionHref: '/app/financeiro/tesouraria',
        },
        {
          title: 'Conta padrão (Pagamentos)',
          description: hasPadraoPag ? 'Ok: há conta padrão para pagamentos.' : 'Defina uma conta padrão para pagamentos (para pagar títulos).',
          status: hasPadraoPag ? 'ok' : hasContaCorrente ? 'warn' : 'missing',
          actionLabel: 'Definir na Tesouraria',
          actionHref: '/app/financeiro/tesouraria',
        },
        {
          title: 'Centro de Custo',
          description: hasCentros ? 'Ok: já existe pelo menos 1 centro de custo.' : 'Cadastre centros de custo para relatórios e auditoria.',
          status: hasCentros ? 'ok' : 'warn',
          actionLabel: 'Abrir Centros de Custo',
          actionHref: '/app/financeiro/centros-de-custo',
        },
        {
          title: 'NF-e: Emitente',
          description: hasEmitente ? 'Ok: emitente configurado.' : 'Cadastre os dados do emitente para emitir NF-e.',
          status: hasEmitente ? 'ok' : 'warn',
          actionLabel: 'Configurar NF-e',
          actionHref: '/app/fiscal/nfe/configuracoes',
        },
        {
          title: 'NF-e: Numeração',
          description: hasNumeracao ? 'Ok: série/numeração configurada.' : 'Configure série/numeração para emitir NF-e.',
          status: hasNumeracao ? 'ok' : 'warn',
          actionLabel: 'Configurar NF-e',
          actionHref: '/app/fiscal/nfe/configuracoes',
        },
      ];

      setChecks(next);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar checklist de onboarding.', 'error');
      setChecks([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, empresaId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const progress = useMemo(() => {
    if (checks.length === 0) return { ok: 0, total: 0 };
    return { ok: checks.filter((c) => c.status === 'ok').length, total: checks.length };
  }, [checks]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Onboarding (Checklist)</h1>
          <p className="mt-2 text-gray-600">
            Checklist guiado por empresa para reduzir retrabalho. <b>Não bloqueia</b> o uso do sistema.
          </p>
          {empresaId ? (
            <div className="mt-2 text-xs text-gray-500">
              Empresa ativa: <span className="font-medium">{activeEmpresa?.fantasia || activeEmpresa?.razao_social || empresaId}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => void load()} variant="outline" className="gap-2" disabled={loading || !empresaId}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white/70 p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="text-sm text-gray-700">
            Progresso: <span className="font-semibold">{progress.ok}</span> / {progress.total}
          </div>
          <div className="text-xs text-gray-500">Dica: mantenha “Tesouraria” com padrões definidos.</div>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-gray-600">
            <Loader2 className="animate-spin mr-2" size={18} />
            Carregando…
          </div>
        ) : checks.length === 0 ? (
          <div className="text-sm text-gray-600">Nenhum item disponível (sem empresa ativa).</div>
        ) : (
          <div className="space-y-3">
            {checks.map((item) => (
              <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <StatusIcon status={item.status} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                    <div className="text-xs text-gray-600 mt-1">{item.description}</div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => navigate(item.actionHref)}
                >
                  <ExternalLink size={16} />
                  {item.actionLabel}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

