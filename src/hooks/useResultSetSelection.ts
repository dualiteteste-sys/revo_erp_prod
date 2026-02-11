import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type ResultSetSelectionMode = 'explicit' | 'all_matching';

export type ResultSetSelectionResetReason = 'empresa_changed' | 'filters_changed';

export function useResultSetSelection(params: {
  pageIds: string[];
  totalMatchingCount: number;
  filterSignature: string;
  empresaId: string | null;
  onAutoReset?: (reason: ResultSetSelectionResetReason) => void;
}) {
  const [mode, setMode] = useState<ResultSetSelectionMode>('explicit');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());

  const lastEmpresaIdRef = useRef<string | null>(params.empresaId);
  const lastSignatureRef = useRef<string>(params.filterSignature);

  const clearInternal = useCallback(() => {
    setMode('explicit');
    setSelectedIds(new Set());
    setExcludedIds(new Set());
  }, []);

  const autoReset = useCallback(
    (reason: ResultSetSelectionResetReason) => {
      clearInternal();
      params.onAutoReset?.(reason);
    },
    [clearInternal, params.onAutoReset]
  );

  // Use layout effects so the selection resets before paint when tenant/filters change.
  // This avoids a one-frame "old selection" flash and prevents unnecessary totals RPC calls.
  useLayoutEffect(() => {
    if (lastEmpresaIdRef.current === params.empresaId) return;
    lastEmpresaIdRef.current = params.empresaId;
    autoReset('empresa_changed');
  }, [autoReset, params.empresaId]);

  useLayoutEffect(() => {
    if (lastSignatureRef.current === params.filterSignature) return;
    lastSignatureRef.current = params.filterSignature;
    // Avoid spamming UI notifications: only notify when we actually had a selection.
    const hadSelection = mode === 'all_matching' || selectedIds.size > 0;
    clearInternal();
    if (hadSelection) params.onAutoReset?.('filters_changed');
  }, [clearInternal, mode, params.filterSignature, params.onAutoReset, selectedIds.size]);

  const selectedCount = useMemo(() => {
    if (mode === 'explicit') return selectedIds.size;
    return Math.max(0, params.totalMatchingCount - excludedIds.size);
  }, [excludedIds.size, mode, params.totalMatchingCount, selectedIds.size]);

  const isSelected = useCallback(
    (id: string) => {
      if (mode === 'explicit') return selectedIds.has(id);
      return !excludedIds.has(id);
    },
    [excludedIds, mode, selectedIds]
  );

  const toggleOne = useCallback(
    (id: string) => {
      if (mode === 'explicit') {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        return;
      }

      setExcludedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [mode]
  );

  const allOnPageSelected = useMemo(() => {
    return params.pageIds.length > 0 && params.pageIds.every((id) => isSelected(id));
  }, [isSelected, params.pageIds]);

  const someOnPageSelected = useMemo(() => {
    return params.pageIds.some((id) => isSelected(id));
  }, [isSelected, params.pageIds]);

  const togglePage = useCallback(() => {
    const ids = params.pageIds;
    if (ids.length === 0) return;

    if (mode === 'explicit') {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const allSelected = ids.every((id) => next.has(id));
        if (allSelected) {
          ids.forEach((id) => next.delete(id));
        } else {
          ids.forEach((id) => next.add(id));
        }
        return next;
      });
      return;
    }

    setExcludedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => !next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.add(id));
      } else {
        ids.forEach((id) => next.delete(id));
      }
      return next;
    });
  }, [mode, params.pageIds]);

  const selectAllMatching = useCallback(() => {
    if (params.totalMatchingCount <= 0) return;
    setMode('all_matching');
    setSelectedIds(new Set());
    setExcludedIds(new Set());
  }, [params.totalMatchingCount]);

  const clear = useCallback(() => {
    clearInternal();
  }, [clearInternal]);

  return {
    mode,
    selectedCount,
    allOnPageSelected,
    someOnPageSelected,

    isSelected,
    toggleOne,
    togglePage,
    selectAllMatching,
    clear,

    selectedIds,
    excludedIds,
  };
}
