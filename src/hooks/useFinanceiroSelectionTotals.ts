import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

export type SelectionTotalsMode = 'explicit' | 'all_matching';

export type SelectionTotalsRequest = {
  mode: SelectionTotalsMode;
  ids: string[];
  excludedIds: string[];
  q: string | null;
  status: string | null;
  startDateISO: string | null;
  endDateISO: string | null;
};

type HookState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

function stableArray(input: Iterable<string>): string[] {
  return Array.from(input).sort();
}

export function useFinanceiroSelectionTotals<T>(params: {
  enabled: boolean;
  request: SelectionTotalsRequest | null;
  fetcher: (req: SelectionTotalsRequest) => Promise<T>;
  debounceMs?: number;
}) {
  const debounceMs = params.debounceMs ?? 200;
  const [state, setState] = useState<HookState<T>>({ loading: false, error: null, data: null });
  const requestTokenRef = useRef(0);
  const requestCacheRef = useRef<{ key: string | null; request: SelectionTotalsRequest | null }>({
    key: null,
    request: null,
  });

  const normalized = useMemo(() => {
    if (!params.enabled || !params.request) return { key: null as string | null, request: null as SelectionTotalsRequest | null };
    const req: SelectionTotalsRequest = {
      ...params.request,
      ids: stableArray(params.request.ids),
      excludedIds: stableArray(params.request.excludedIds),
    };
    return { key: JSON.stringify(req), request: req };
  }, [params.enabled, params.request]);

  const stableRequest = useMemo(() => {
    if (!normalized.key || !normalized.request) {
      requestCacheRef.current = { key: null, request: null };
      return null;
    }
    if (requestCacheRef.current.key === normalized.key) return requestCacheRef.current.request;
    requestCacheRef.current = { key: normalized.key, request: normalized.request };
    return normalized.request;
  }, [normalized.key, normalized.request]);

  const debouncedKey = useDebounce(normalized.key, debounceMs);

  const fetchTotals = useCallback(
    async (req: SelectionTotalsRequest) => {
      const token = ++requestTokenRef.current;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await params.fetcher(req);
        if (token !== requestTokenRef.current) return;
        setState({ loading: false, error: null, data });
      } catch (e: unknown) {
        if (token !== requestTokenRef.current) return;
        const msg = e instanceof Error ? e.message : null;
        setState({ loading: false, error: msg || 'Erro ao calcular totais.', data: null });
      }
    },
    [params.fetcher]
  );

  useEffect(() => {
    if (!params.enabled || !stableRequest) {
      requestTokenRef.current++;
      setState((prev) => {
        if (!prev.loading && prev.error === null && prev.data === null) return prev;
        return { loading: false, error: null, data: null };
      });
      return;
    }
    if (!debouncedKey) return;
    // Se a key ainda não estabilizou (debounce), aguarde para evitar floods e "loading infinito".
    if (debouncedKey !== normalized.key) return;
    void fetchTotals(stableRequest);
  }, [debouncedKey, fetchTotals, normalized.key, params.enabled, stableRequest]);

  return state;
}
