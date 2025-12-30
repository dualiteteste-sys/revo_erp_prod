import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Button } from '@/components/ui/button';
import OnboardingWizardModal from './OnboardingWizardModal';
import { fetchOnboardingChecks, type CheckStatus, type OnboardingCheck } from './onboardingChecks';

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
  const [checks, setChecks] = useState<OnboardingCheck[]>([]);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const empresaId = activeEmpresa?.id ?? null;

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const res = await fetchOnboardingChecks(supabase, empresaId);
      setChecks(res.checks);
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
          <Button
            onClick={() => setIsWizardOpen(true)}
            variant="outline"
            className="gap-2"
            disabled={!empresaId}
          >
            <Sparkles size={16} />
            Assistente
          </Button>
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

      <OnboardingWizardModal
        isOpen={isWizardOpen}
        mode="manual"
        onClose={() => {
          setIsWizardOpen(false);
          void load();
        }}
      />
    </div>
  );
}
