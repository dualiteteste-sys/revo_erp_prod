import { useCallback, useEffect, useRef, useState } from 'react';
import { searchItemsForOs, type OsItemSearchResult } from '@/services/os';

/**
 * Unified PDV search hook — detects barcode scanner input (fast + digits + Enter)
 * vs manual text search (debounced 250ms).
 */
export function usePdvOmnibox(opts: {
  onProductFound: (hit: OsItemSearchResult) => void;
  onNotFound: (query: string) => void;
  disabled?: boolean;
}) {
  const { onProductFound, onNotFound, disabled } = opts;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OsItemSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [lookingUp, setLookingUp] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const keystrokeTimes = useRef<number[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onProductFoundRef = useRef(onProductFound);
  const onNotFoundRef = useRef(onNotFound);

  // Keep refs in sync
  useEffect(() => { onProductFoundRef.current = onProductFound; }, [onProductFound]);
  useEffect(() => { onNotFoundRef.current = onNotFound; }, [onNotFound]);

  // Debounced text search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    // Don't debounce-search if it looks like a scanner input in progress
    // (pure digits being typed fast)
    if (/^\d+$/.test(q) && keystrokeTimes.current.length >= 3) {
      const avg = avgInterval(keystrokeTimes.current);
      if (avg < 80) return; // scanner — wait for Enter
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchItemsForOs(q, 10, true, 'product');
        setResults(r || []);
        setShowDropdown(true);
        setHighlightIdx(0);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    keystrokeTimes.current = [];
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    keystrokeTimes.current.push(Date.now());
    // Keep only last 50 timestamps
    if (keystrokeTimes.current.length > 50) keystrokeTimes.current.shift();
    setQuery(val);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      return;
    }

    if (e.key === 'ArrowDown' && showDropdown && results.length > 0) {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }

    if (e.key === 'ArrowUp' && showDropdown && results.length > 0) {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const q = query.trim();
      if (!q || lookingUp) return;

      // Check if this is a barcode scanner input
      if (isScannerInput(keystrokeTimes.current, q)) {
        // Immediate SKU lookup
        setLookingUp(true);
        searchItemsForOs(q, 5, true, 'product')
          .then((hits) => {
            const hit = hits?.find((r) => r.sku === q || r.codigo === q) || hits?.[0];
            if (hit) {
              onProductFoundRef.current(hit);
            } else {
              onNotFoundRef.current(q);
            }
          })
          .catch(() => onNotFoundRef.current(q))
          .finally(() => {
            setLookingUp(false);
            clearSearch();
          });
      } else if (showDropdown && results.length > 0) {
        // Select highlighted item from dropdown
        const hit = results[highlightIdx];
        if (hit) {
          onProductFoundRef.current(hit);
          clearSearch();
        }
      } else if (q.length >= 2) {
        // Manual Enter on a text query with no dropdown — do an immediate search
        setLookingUp(true);
        searchItemsForOs(q, 5, true, 'product')
          .then((hits) => {
            const hit = hits?.find((r) => r.sku === q || r.codigo === q) || hits?.[0];
            if (hit) {
              onProductFoundRef.current(hit);
              clearSearch();
            } else {
              onNotFoundRef.current(q);
            }
          })
          .catch(() => onNotFoundRef.current(q))
          .finally(() => setLookingUp(false));
      }
    }
  }, [query, showDropdown, results, highlightIdx, lookingUp, clearSearch]);

  return {
    query,
    setQuery,
    results,
    isSearching: isSearching || lookingUp,
    showDropdown,
    highlightIdx,
    setHighlightIdx,
    inputRef,
    handleChange,
    handleKeyDown,
    clearSearch,
    disabled: disabled || lookingUp,
    setShowDropdown,
  };
}

/** Check if recent keystrokes indicate a barcode scanner (fast, pure digits). */
function isScannerInput(timestamps: number[], query: string): boolean {
  if (timestamps.length < 3 || !/^\d+$/.test(query)) return false;
  return avgInterval(timestamps) < 80;
}

function avgInterval(timestamps: number[]): number {
  if (timestamps.length < 2) return Infinity;
  return (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1);
}
