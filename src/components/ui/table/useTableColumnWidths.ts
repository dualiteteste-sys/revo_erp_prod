import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type TableColumnWidthDef = {
  id: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
};

type WidthsState = Record<string, number | undefined>;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function readWidths(key: string): WidthsState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as WidthsState;
  } catch {
    return null;
  }
}

function writeWidths(key: string, widths: WidthsState) {
  try {
    localStorage.setItem(key, JSON.stringify(widths));
  } catch {
    // ignore storage errors
  }
}

export function useTableColumnWidths(params: {
  tableId: string;
  columns: TableColumnWidthDef[];
  storageKeyPrefix?: string;
}) {
  const storageKey = `${params.storageKeyPrefix ?? 'table:widths'}:${params.tableId}`;

  const columnsById = useMemo(() => {
    const map = new Map<string, TableColumnWidthDef>();
    for (const c of params.columns) map.set(c.id, c);
    return map;
  }, [params.columns]);

  const [widths, setWidths] = useState<WidthsState>(() => {
    const saved = typeof window !== 'undefined' ? readWidths(storageKey) : null;
    const next: WidthsState = {};
    for (const c of params.columns) {
      const savedW = saved?.[c.id];
      const base = typeof savedW === 'number' && Number.isFinite(savedW) ? savedW : c.defaultWidth;
      if (typeof base === 'number' && Number.isFinite(base)) next[c.id] = base;
    }
    return next;
  });

  useEffect(() => {
    writeWidths(storageKey, widths);
  }, [storageKey, widths]);

  const dragRef = useRef<{
    id: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const setColumnWidth = useCallback((id: string, nextWidth: number) => {
    const def = columnsById.get(id);
    if (!def || def.resizable === false) return;
    const minW = def.minWidth ?? 80;
    const maxW = def.maxWidth ?? 1200;
    const clamped = clamp(nextWidth, minW, maxW);
    setWidths((prev) => ({ ...prev, [id]: clamped }));
  }, [columnsById]);

  const startResize = useCallback((id: string, startX: number) => {
    const def = columnsById.get(id);
    if (!def || def.resizable === false) return;
    const startWidth = Number(widths[id] ?? def.defaultWidth ?? 160);
    if (!Number.isFinite(startWidth) || startWidth <= 0) return;

    dragRef.current = { id, startX, startWidth };
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      setColumnWidth(drag.id, drag.startWidth + delta);
    };

    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [columnsById, setColumnWidth, widths]);

  const resetWidths = useCallback(() => {
    const next: WidthsState = {};
    for (const c of params.columns) {
      if (typeof c.defaultWidth === 'number' && Number.isFinite(c.defaultWidth)) next[c.id] = c.defaultWidth;
    }
    setWidths(next);
  }, [params.columns]);

  return { widths, setColumnWidth, startResize, resetWidths };
}

