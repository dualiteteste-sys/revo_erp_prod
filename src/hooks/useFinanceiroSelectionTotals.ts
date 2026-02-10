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

  const normalizedRequest = useMemo(() => {
    if (!params.request) return null;
    return {
      ...params.request,
      ids: stableArray(params.request.ids),
      excludedIds: stableArray(params.request.excludedIds),
    };
  }, [params.request]);

  const requestKey = useMemo(() => {
    if (!params.enabled || !normalizedRequest) return null;
    return JSON.stringify(normalizedRequest);
  }, [normalizedRequest, params.enabled]);

  const debouncedKey = useDebounce(requestKey, debounceMs);

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
    [params]
  );

  useEffect(() => {
    if (!params.enabled || !normalizedRequest) {
      requestTokenRef.current++;
      setState({ loading: false, error: null, data: null });
      return;
    }
    if (!debouncedKey) return;
    void fetchTotals(normalizedRequest);
  }, [debouncedKey, fetchTotals, normalizedRequest, params.enabled]);

  return state;
}
