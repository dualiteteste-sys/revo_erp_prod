import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthProvider';

type EditLockPayload = {
  tabId: string;
  ts: number;
  path?: string;
};

function getTabId(): string {
  if (typeof window === 'undefined') return 'server';

  const key = 'ultria_tab_id';
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;

  const id =
    typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(key, id);
  return id;
}

function safeParse(payload: string | null): EditLockPayload | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as EditLockPayload;
    if (!parsed || typeof parsed.tabId !== 'string' || typeof parsed.ts !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function nowMs(): number {
  return typeof Date.now === 'function' ? Date.now() : new Date().getTime();
}

export function useEditLock(resource: string, ttlMs: number = 10 * 60 * 1000) {
  const { activeEmpresaId } = useAuth();
  const tabId = useMemo(() => getTabId(), []);
  const currentKeyRef = useRef<string | null>(null);

  const makeKey = useCallback(
    (recordId: string) => `ultria:editlock:${activeEmpresaId ?? 'no_empresa'}:${resource}:${recordId}`,
    [activeEmpresaId, resource]
  );

  const releaseKeyIfOwned = useCallback(
    (key: string) => {
      if (typeof window === 'undefined') return;
      const payload = safeParse(window.localStorage.getItem(key));
      if (!payload) return;
      if (payload.tabId !== tabId) return;
      window.localStorage.removeItem(key);
    },
    [tabId]
  );

  const release = useCallback(
    (recordId?: string) => {
      if (typeof window === 'undefined') return;
      const key = recordId ? makeKey(recordId) : currentKeyRef.current;
      if (!key) return;
      releaseKeyIfOwned(key);
      if (currentKeyRef.current === key) currentKeyRef.current = null;
    },
    [makeKey, releaseKeyIfOwned]
  );

  const claim = useCallback(
    async (
      recordId: string,
      opts?: {
        confirmConflict?: (ctx: { existingPath?: string | null }) => Promise<boolean>;
        path?: string;
      }
    ): Promise<boolean> => {
      if (typeof window === 'undefined') return true;
      const key = makeKey(recordId);

      const existing = safeParse(window.localStorage.getItem(key));
      const isStale = existing ? nowMs() - existing.ts > ttlMs : false;

      if (existing && !isStale && existing.tabId !== tabId) {
        const shouldOverride = await opts?.confirmConflict?.({ existingPath: existing.path ?? null });
        if (!shouldOverride) return false;
      }

      // Se estava editando outro registro, libera antes de claim do novo.
      if (currentKeyRef.current && currentKeyRef.current !== key) {
        releaseKeyIfOwned(currentKeyRef.current);
      }

      const payload: EditLockPayload = { tabId, ts: nowMs(), path: opts?.path ?? window.location?.pathname };
      window.localStorage.setItem(key, JSON.stringify(payload));
      currentKeyRef.current = key;
      return true;
    },
    [makeKey, releaseKeyIfOwned, tabId, ttlMs]
  );

  // Cleanup best-effort
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onBeforeUnload = () => {
      if (currentKeyRef.current) releaseKeyIfOwned(currentKeyRef.current);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (currentKeyRef.current) releaseKeyIfOwned(currentKeyRef.current);
    };
  }, [releaseKeyIfOwned]);

  return { claim, release, tabId };
}

