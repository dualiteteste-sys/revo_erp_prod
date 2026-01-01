import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { fetchOnboardingChecks } from '@/components/settings/onboarding/onboardingChecks';

const STORAGE_DISMISS_UNTIL = 'ui:onboardingGateDismissUntil';

function getDismissUntil(): number {
  try {
    const raw = localStorage.getItem(STORAGE_DISMISS_UNTIL);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function setDismissForHours(hours: number) {
  try {
    const until = Date.now() + hours * 60 * 60 * 1000;
    localStorage.setItem(STORAGE_DISMISS_UNTIL, String(until));
  } catch {
    // ignore
  }
}

type Props = {
  onOpenWizard: () => void;
};

export default function OnboardingGateBanner({ onOpenWizard }: Props) {
  const supabase = useSupabase();
  const { activeEmpresa } = useAuth();
  const empresaId = activeEmpresa?.id ?? null;

  const [dismissed, setDismissed] = useState(() => getDismissUntil() > Date.now());
  const [progress, setProgress] = useState<{ ok: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const completed = useMemo(() => {
    if (!progress) return false;
    return progress.total > 0 && progress.ok >= progress.total;
  }, [progress]);

  useEffect(() => {
    if (!empresaId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetchOnboardingChecks(supabase, empresaId);
        if (cancelled) return;
        setProgress(res.progress);
      } catch {
        // Não quebra UX: se falhar, só não exibe o banner.
        if (!cancelled) setProgress(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [empresaId, supabase]);

  if (!empresaId || completed) return null;

  // Se o usuário descartou recentemente, mostra apenas um chip discreto (CTA).
  if (dismissed) {
    return (
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenWizard}
          className="gap-2"
          title="Concluir configurações iniciais"
        >
          <CheckCircle2 size={16} />
          {loading || !progress ? 'Configuração inicial' : `Configuração inicial: ${progress.ok}/${progress.total}`}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-indigo-900">Configuração inicial</div>
        <div className="text-sm text-indigo-800 mt-0.5">
          {loading || !progress ? (
            'Carregando status…'
          ) : (
            <>
              Progresso: <span className="font-semibold">{progress.ok}</span> / {progress.total}. Conclua o mínimo para
              emitir, receber e controlar seu caixa.
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button onClick={onOpenWizard} className="gap-2" size="sm">
          Assistente de configuração
          <ChevronRight size={16} />
        </Button>
        <button
          type="button"
          className="p-2 rounded-lg text-indigo-700 hover:bg-indigo-100"
          onClick={() => {
            setDismissForHours(24);
            setDismissed(true);
          }}
          aria-label="Ocultar por agora"
          title="Ocultar por agora"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
