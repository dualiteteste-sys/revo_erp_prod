import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { onboardingWizardStateGet, onboardingWizardStateUpsert } from '@/services/onboardingWizardState';

import type { RoadmapGroup, RoadmapGroupKey, RoadmapStepStatus } from './types';
import { getRoadmaps } from './roadmaps';

type Props = {
  isOpen: boolean;
  initialKey?: RoadmapGroupKey | null;
  onClose: () => void;
};

type RoadmapState = {
  active?: RoadmapGroupKey;
  ack?: Record<string, true>;
};

function safeGetRoadmapState(steps: Record<string, unknown> | null | undefined): RoadmapState {
  const rm = (steps?.roadmap ?? null) as any;
  if (!rm || typeof rm !== 'object') return {};
  const rawActive = typeof rm.active === 'string' ? (rm.active as string) : undefined;
  // Back-compat: versões antigas usavam "comercio" como grupo principal.
  const normalizedActive = rawActive === 'comercio' ? 'vendas' : rawActive;
  const allowed: Record<RoadmapGroupKey, true> = {
    cadastros: true,
    vendas: true,
    suprimentos: true,
    financeiro: true,
    fiscal: true,
    servicos: true,
    industria: true,
    integracoes: true,
  };
  const active = normalizedActive && (allowed as any)[normalizedActive] ? (normalizedActive as RoadmapGroupKey) : undefined;
  const ack = rm.ack && typeof rm.ack === 'object' ? (rm.ack as Record<string, true>) : undefined;
  return { active, ack };
}

export default function RoadmapWizardModal({ isOpen, initialKey, onClose }: Props) {
  const supabase = useSupabase();
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const features = useEmpresaFeatures();

  const empresaId = activeEmpresa?.id ?? null;
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState<RoadmapGroupKey>('vendas');
  const [statuses, setStatuses] = useState<Record<string, RoadmapStepStatus>>({});
  const [unknownKeys, setUnknownKeys] = useState<Set<string>>(new Set());
  const ackRef = useRef<Record<string, true>>({});
  const stateRef = useRef<RoadmapState>({});

  const roadmaps = useMemo<RoadmapGroup[]>(() => {
    const all = getRoadmaps();
    return all.filter((g) => {
      if (g.key === 'industria') return features.industria_enabled;
      if (g.key === 'servicos') return features.servicos_enabled;
      return true;
    });
  }, [features.industria_enabled, features.servicos_enabled]);

  const active = useMemo(() => roadmaps.find((r) => r.key === activeKey) ?? roadmaps[0] ?? null, [activeKey, roadmaps]);

  const ensureRow = useCallback(async () => {
    if (!empresaId) return;
    await onboardingWizardStateGet();
  }, [empresaId]);

  const loadState = useCallback(async (): Promise<RoadmapState> => {
    if (!empresaId) return {};
    const row = await onboardingWizardStateGet();
    const state = safeGetRoadmapState(((row?.steps ?? null) as any) ?? null);
    ackRef.current = state.ack ?? {};
    stateRef.current = state;
    return state;
  }, [empresaId]);

  const updateState = useCallback(
    async (patch: Partial<RoadmapState>) => {
      if (!empresaId) return;
      const current = stateRef.current;
      const next: RoadmapState = { active: patch.active ?? current.active, ack: patch.ack ?? current.ack };
      stateRef.current = next;
      ackRef.current = next.ack ?? {};
      await onboardingWizardStateUpsert({ steps: { roadmap: next } });
    },
    [empresaId]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (!initialKey) return;
    if (!roadmaps.some((r) => r.key === initialKey)) return;
    setActiveKey(initialKey);
    void updateState({ active: initialKey });
  }, [initialKey, isOpen, roadmaps, updateState]);

  const refresh = useCallback(async () => {
    if (!empresaId) return;
    if (!active) return;
    setLoading(true);
    try {
      const nextUnknown = new Set<string>();
      const results = await Promise.all(
        active.steps.map(async (step) => {
          try {
            const ok = await step.check(supabase);
            return { key: step.key, status: ok ? ('done' as const) : ('todo' as const) };
          } catch {
            nextUnknown.add(step.key);
            return { key: step.key, status: 'unknown' as const };
          }
        })
      );

      const nextStatuses: Record<string, RoadmapStepStatus> = {};
      for (const r of results) nextStatuses[r.key] = r.status;

      // Congratula apenas 1x por etapa (ACK persistido em empresa_onboarding.steps.roadmap.ack).
      const newlyDone = results.filter((r) => r.status === 'done' && !ackRef.current[r.key]);
      if (newlyDone.length > 0) {
        const ack = { ...ackRef.current };
        for (const r of newlyDone) ack[r.key] = true;
        ackRef.current = ack;
        await updateState({ ack });
        for (const r of newlyDone) {
          const title = active.steps.find((s) => s.key === r.key)?.title ?? 'Etapa concluída';
          addToast(`Parabéns! Etapa concluída: ${title}.`, 'success');
        }
      }

      setUnknownKeys(nextUnknown);
      setStatuses(nextStatuses);
    } finally {
      setLoading(false);
    }
  }, [active, addToast, empresaId, supabase, updateState]);

  useEffect(() => {
    if (!isOpen) return;
    if (!empresaId) return;
    void (async () => {
      await ensureRow();
      const state = await loadState();
      const preferred = state.active && roadmaps.some((r) => r.key === state.active) ? state.active : (roadmaps[0]?.key ?? 'vendas');
      setActiveKey(preferred);
      await updateState({ active: preferred });
    })();
  }, [ensureRow, isOpen, loadState, roadmaps, empresaId, updateState]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [activeKey, isOpen, refresh]);

  const progress = useMemo(() => {
    if (!active) return { ok: 0, total: 0 };
    const total = active.steps.length;
    const ok = active.steps.filter((s) => statuses[s.key] === 'done').length;
    return { ok, total };
  }, [active, statuses]);

  const nextStep = useMemo(() => {
    if (!active) return null;
    return active.steps.find((s) => statuses[s.key] !== 'done') ?? null;
  }, [active, statuses]);

  const handleOpenStep = async (href: string) => {
    onClose();
    navigate(href);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Roadmap (primeiro uso)" size="4xl">
      <div className="p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">Guia rápido por módulo (opt-in)</h2>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              Escolha um objetivo e siga o passo a passo. O sistema marca automaticamente quando você concluir cada etapa.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={loading || !empresaId}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : null}
              Verificar
            </Button>
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-700">
            Progresso: <span className="font-semibold">{progress.ok}</span> / {progress.total}
          </div>
          <div className="text-xs text-gray-500">
            {nextStep ? (
              <>
                Próximo: <span className="font-medium">{nextStep.title}</span>
              </>
            ) : (
              'Tudo pronto neste roadmap.'
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 rounded-xl border border-gray-200 bg-white p-2">
            <div className="space-y-1">
              {roadmaps.map((r) => {
                const isActive = r.key === activeKey;
                return (
                  <button
                    key={r.key}
                    className={`w-full text-left rounded-lg px-3 py-2 transition border ${
                      isActive ? 'border-indigo-300 bg-indigo-50/40' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                    }`}
                    type="button"
                    onClick={() => {
                      setActiveKey(r.key);
                      void updateState({ active: r.key });
                    }}
                  >
                    <div className="text-sm font-semibold text-gray-900">{r.title}</div>
                    <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{r.subtitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
            {!active ? (
              <div className="text-sm text-gray-600">Sem módulos disponíveis neste plano.</div>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{active.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{active.subtitle}</p>
                </div>

                <div className="space-y-2">
                  {active.steps.map((step) => {
                    const st = statuses[step.key] ?? 'unknown';
                    const badge =
                      st === 'done' ? 'bg-emerald-50 text-emerald-700' : st === 'todo' ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700';
                    return (
                      <div key={step.key} className="rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-gray-900">{step.title}</div>
                              <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge}`}>
                                {st === 'done' ? 'OK' : st === 'todo' ? 'Pendente' : 'Verificar'}
                              </span>
                            </div>
                            <div className="mt-1 text-sm text-gray-600">{step.description}</div>
                            {unknownKeys.has(step.key) ? (
                              <div className="mt-2 text-xs text-amber-700">
                                Não foi possível validar automaticamente agora. Você ainda pode seguir o passo e clicar em Verificar.
                              </div>
                            ) : null}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <Button
                              className="gap-2"
                              variant={st === 'done' ? 'outline' : 'default'}
                              onClick={() => void handleOpenStep(step.actionHref)}
                            >
                              <ExternalLink size={16} />
                              {step.actionLabel}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
