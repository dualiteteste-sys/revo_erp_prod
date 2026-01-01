import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { useSupabase } from '@/providers/SupabaseProvider';
import { useToast } from '@/contexts/ToastProvider';

type CheckStatus = 'ok' | 'warn' | 'missing';

type OnboardingCheck = {
  key: string;
  title: string;
  status: CheckStatus;
};

type OnboardingRpcResult = {
  checks: OnboardingCheck[];
  progress?: { ok: number; total: number };
};

type EnsureResult = {
  ok: boolean;
  missingKey: string | null;
};

type ContextValue = {
  openWizard: (stepKey?: string | null) => Promise<void> | void;
  ensure: (requiredKeys: string[]) => Promise<EnsureResult>;
};

const Ctx = createContext<ContextValue | null>(null);

export function OnboardingGateProvider({
  children,
  openWizard,
}: {
  children: React.ReactNode;
  openWizard: (stepKey?: string | null) => Promise<void> | void;
}) {
  const supabase = useSupabase();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  const ensure = useCallback(
    async (requiredKeys: string[]): Promise<EnsureResult> => {
      if (busy) return { ok: true, missingKey: null };
      if (!requiredKeys || requiredKeys.length === 0) return { ok: true, missingKey: null };

      setBusy(true);
      try {
        const { data, error } = await supabase.rpc('onboarding_checks_for_current_empresa');
        if (error) {
          // Evita falso-positivo bloqueando o app: se não conseguir validar, deixa seguir.
          return { ok: true, missingKey: null };
        }

        // Se o backend retornou algo inesperado, não bloqueia.
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return { ok: true, missingKey: null };
        }

        const result = data as unknown as OnboardingRpcResult;
        const checks = Array.isArray(result.checks) ? result.checks : [];
        if (checks.length === 0) return { ok: true, missingKey: null };

        const byKey = new Map(checks.map((c) => [c.key, c]));
        const missing = requiredKeys.find((k) => (byKey.get(k)?.status ?? 'missing') !== 'ok') ?? null;

        if (!missing) return { ok: true, missingKey: null };

        const title = byKey.get(missing)?.title ?? 'Configuração inicial';
        addToast(`Para continuar, conclua: ${title}.`, 'warning');
        await openWizard(missing);
        return { ok: false, missingKey: missing };
      } catch {
        // Não bloquear se não conseguir validar (fallback seguro).
        return { ok: true, missingKey: null };
      } finally {
        setBusy(false);
      }
    },
    [addToast, busy, openWizard, supabase]
  );

  const value = useMemo<ContextValue>(() => ({ openWizard, ensure }), [ensure, openWizard]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboardingGate() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOnboardingGate must be used within OnboardingGateProvider');
  return ctx;
}

