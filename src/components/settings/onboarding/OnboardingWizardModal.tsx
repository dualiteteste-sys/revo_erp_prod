import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAppContext } from '@/contexts/AppContextProvider';
import { useToast } from '@/contexts/ToastProvider';
import { fetchOnboardingChecks, type OnboardingCheck } from './onboardingChecks';
import OnboardingStepModal, { isEmbeddedOnboardingStep } from './OnboardingStepModal';
import { onboardingWizardStateGet, onboardingWizardStateUpsert } from '@/services/onboardingWizardState';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'auto' | 'manual';
  forceStepKey?: string | null;
};

type EmpresaOnboardingRow = {
  empresa_id: string;
  wizard_dismissed_at: string | null;
  last_step_key: string | null;
  steps: Record<string, unknown>;
};

export default function OnboardingWizardModal({ isOpen, onClose, mode = 'manual', forceStepKey }: Props) {
  const supabase = useSupabase();
  const { activeEmpresa } = useAppContext();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const empresaId = activeEmpresa?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState<OnboardingCheck[]>([]);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [activeStepModalKey, setActiveStepModalKey] = useState<string | null>(null);

  const ensureEmpresaAtivaNoBanco = useCallback(async () => {
    if (!empresaId) return false;
    try {
      // Estado da arte: garantir que o backend tenha empresa ativa antes de chamar RPCs baseadas em current_empresa_id().
      const { error } = await (supabase as any).rpc('set_active_empresa_for_current_user', { p_empresa_id: empresaId });
      if (error) throw error;
      return true;
    } catch {
      // best-effort: algumas telas podem funcionar mesmo assim (fallbacks); mas evita "Sem itens" no onboarding.
      return false;
    }
  }, [empresaId, supabase]);

  const ensureOnboardingRow = useCallback(async () => {
    if (!empresaId) return;
    await onboardingWizardStateGet();
  }, [empresaId]);

  const loadState = useCallback(async () => {
    if (!empresaId) return null;
    const row = await onboardingWizardStateGet();
    return row ? (row as unknown as EmpresaOnboardingRow) : null;
  }, [empresaId]);

  const updateState = useCallback(
    async (patch: Partial<EmpresaOnboardingRow>) => {
      if (!empresaId) return;
      await onboardingWizardStateUpsert({
        wizard_dismissed_at:
          typeof patch.wizard_dismissed_at === "string" || patch.wizard_dismissed_at === null
            ? (patch.wizard_dismissed_at as any)
            : undefined,
        last_step_key: typeof patch.last_step_key === "string" || patch.last_step_key === null ? (patch.last_step_key as any) : undefined,
      });
    },
    [empresaId]
  );

  const refresh = useCallback(async (): Promise<OnboardingCheck[]> => {
    if (!empresaId) {
      setChecks([]);
      return [];
    }
    setLoading(true);
    try {
      await ensureEmpresaAtivaNoBanco();
      const res = await fetchOnboardingChecks(supabase, empresaId);
      setChecks(res.checks);
      return res.checks;
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar assistente de onboarding.', 'error');
      return [];
    } finally {
      setLoading(false);
    }
  }, [addToast, empresaId, ensureEmpresaAtivaNoBanco, supabase]);

  const afterStepDone = useCallback(async () => {
    const updated = await refresh();
    const nextCurrent = updated.find((c) => c.status !== 'ok');
    if (nextCurrent) {
      await updateState({ last_step_key: nextCurrent.key, wizard_dismissed_at: null });
      setCurrentKey(nextCurrent.key);
    }
  }, [refresh, updateState]);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        // Abertura do modal deve ser determinística: garante empresa ativa no backend antes de buscar checks/state.
        await ensureEmpresaAtivaNoBanco();
        if (!empresaId) return;
        await ensureOnboardingRow();
        const state = await loadState();
        await refresh();
        if (forceStepKey) {
          setCurrentKey(forceStepKey);
          await updateState({ last_step_key: forceStepKey, wizard_dismissed_at: null });
        } else if (state?.last_step_key) {
          setCurrentKey(state.last_step_key);
        }
      } catch {
        // ignore
      }
    })();
  }, [empresaId, ensureEmpresaAtivaNoBanco, ensureOnboardingRow, forceStepKey, isOpen, loadState, refresh, updateState]);

  const progress = useMemo(() => {
    if (checks.length === 0) return { ok: 0, total: 0 };
    return { ok: checks.filter((c) => c.status === 'ok').length, total: checks.length };
  }, [checks]);

  const current = useMemo(() => {
    if (checks.length === 0) return null;
    const byKey = new Map(checks.map((c) => [c.key, c]));
    if (currentKey && byKey.has(currentKey)) return byKey.get(currentKey) ?? null;
    const firstMissing = checks.find((c) => c.status !== 'ok');
    return firstMissing ?? checks[0];
  }, [checks, currentKey]);

  const handleSelect = async (step: OnboardingCheck) => {
    setCurrentKey(step.key);
    await updateState({ last_step_key: step.key, wizard_dismissed_at: null });
  };

  const handleGoToStep = async () => {
    if (!current) return;
    if (!empresaId) {
      addToast('Selecione uma empresa ativa para configurar este item.', 'warning');
      return;
    }
    await updateState({ last_step_key: current.key, wizard_dismissed_at: null });

    // Gate suave “in-place”: todas as etapas abrem em modal por cima do assistente.
    // Se a etapa não tiver UI embutida, mantemos como fallback navegar (mas hoje todas estão embutidas).
    if (isEmbeddedOnboardingStep(current.key)) {
      setCurrentKey(current.key);
      setActiveStepModalKey(current.key);
      return;
    }
    navigate(current.actionHref);
  };

  const handleSkip = async () => {
    if (empresaId) {
      await updateState({ wizard_dismissed_at: new Date().toISOString() });
    }
    onClose();
  };

  const title = mode === 'auto' ? 'Assistente de Onboarding' : 'Assistente (Onboarding)';

  return (
    <Modal isOpen={isOpen} onClose={handleSkip} title={title} size="4xl">
      <div className="p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">Vamos deixar sua empresa pronta para operar</h2>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              Este assistente não bloqueia o uso do sistema, mas reduz erros e retrabalho.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={loading || !empresaId}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : null}
              Verificar novamente
            </Button>
            <Button variant="outline" onClick={() => void handleSkip()}>
              Pular por agora
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Progresso: <span className="font-semibold">{progress.ok}</span> / {progress.total}
          </div>
          <div className="text-xs text-gray-500">Dica: comece pela Tesouraria para evitar bloqueios no Financeiro.</div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 rounded-xl border border-gray-200 bg-white p-2">
            {checks.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">
                {loading
                  ? 'Carregando…'
                  : !empresaId
                    ? 'Sem itens (sem empresa ativa).'
                    : 'Nenhuma pendência encontrada. Clique em “Verificar novamente” se acabou de concluir uma etapa.'}
              </div>
            ) : (
              <div className="space-y-1">
                {checks.map((step) => {
                  const isActive = current?.key === step.key;
                  const badge =
                    step.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : step.status === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700';
                  return (
                    <button
                      key={step.key}
                      className={`w-full text-left rounded-lg px-3 py-2 transition border ${
                        isActive ? 'border-indigo-300 bg-indigo-50/40' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => void handleSelect(step)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-900">{step.title}</div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge}`}>
                          {step.status === 'ok' ? 'OK' : step.status === 'warn' ? 'Atenção' : 'Faltando'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1 line-clamp-2">{step.description}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
            {!current ? (
              <div className="text-sm text-gray-600">
                {loading ? 'Carregando…' : !empresaId ? 'Sem empresa ativa.' : 'Selecione um item à esquerda.'}
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{current.title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{current.description}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      current.status === 'ok'
                        ? 'bg-emerald-50 text-emerald-700'
                        : current.status === 'warn'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {current.status === 'ok' ? 'Concluído' : current.status === 'warn' ? 'Quase lá' : 'Pendente'}
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className="text-xs text-gray-500">
                    Após ajustar na tela indicada, volte e clique em <span className="font-medium">Verificar novamente</span>.
                  </div>
                  <Button className="gap-2" onClick={() => void handleGoToStep()} disabled={!empresaId || loading}>
                    <ExternalLink size={16} />
                    {isEmbeddedOnboardingStep(current.key) ? 'Configurar agora' : current.actionLabel}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 text-xs text-gray-500">
          {mode === 'auto' ? 'Você pode reabrir depois em Configurações → Geral → Onboarding (Checklist) → Assistente.' : null}
        </div>
      </div>

      {empresaId && activeStepModalKey ? (
        <OnboardingStepModal
          isOpen={!!activeStepModalKey}
          empresaId={empresaId}
          step={checks.find((c) => c.key === activeStepModalKey) ?? current ?? checks[0]}
          onClose={() => setActiveStepModalKey(null)}
          onDone={async () => {
            await afterStepDone();
          }}
        />
      ) : null}
    </Modal>
  );
}
