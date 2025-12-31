import { useCallback, useMemo, useState } from 'react';

export function useBulkSelection<T>(items: T[], getId: (item: T) => string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const allIds = useMemo(() => items.map(getId), [items, getId]);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const setAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const toggleAll = useCallback(
    (ids: string[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
        if (allSelected) {
          ids.forEach((id) => next.delete(id));
          return next;
        }
        ids.forEach((id) => next.add(id));
        return next;
      });
    },
    []
  );

  const selectedCount = selectedIds.size;
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = allIds.some((id) => selectedIds.has(id));

  return {
    selectedIds,
    selectedCount,
    allIds,
    allSelected,
    someSelected,
    isSelected,
    toggle,
    toggleAll,
    setAll,
    clear,
  };
}

