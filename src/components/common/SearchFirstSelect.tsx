import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search, PlusSquare, ExternalLink } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

export type SearchFirstHit = {
  id: string;
  label: string;
  subtitle?: string | null;
  meta?: Record<string, any>;
};

type Props = {
  value: string | null;
  initialLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  minChars?: number;
  limit?: number;

  search: (q: string, limit: number) => Promise<SearchFirstHit[]>;
  onSelect: (hit: SearchFirstHit) => void;
  onClear?: () => void;

  createLabel?: string; // ex: "Criar cliente"
  onCreate?: (draft: { q: string }) => void; // abre side sheet
  openCreateInNewTabHref?: string; // abre cadastro completo

  className?: string;
};

export default function SearchFirstSelect({
  value,
  initialLabel,
  placeholder,
  disabled,
  minChars = 2,
  limit = 20,
  search,
  onSelect,
  onClear,
  createLabel,
  onCreate,
  openCreateInNewTabHref,
  className,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchFirstHit[]>([]);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (value && initialLabel) {
      setQuery(initialLabel);
    } else if (!value) {
      setQuery('');
    }
  }, [value, initialLabel]);

  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  useEffect(() => {
    if (!open || !inputRef.current) return;
    const updatePosition = () => {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 10;
      setDropdownStyle({
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        maxHeight: `${Math.max(200, spaceBelow)}px`,
        zIndex: 100000,
      });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, hits.length]);

  useEffect(() => {
    const doSearch = async () => {
      const q = debouncedQuery.trim();
      if (q.length < minChars) {
        setHits([]);
        return;
      }
      if (value) return;
      setLoading(true);
      try {
        const res = await search(q, limit);
        setHits(res);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    };
    void doSearch();
  }, [debouncedQuery, minChars, limit, search, value]);

  const showCreateRow = useMemo(() => {
    if (!onCreate || !createLabel) return false;
    if (disabled) return false;
    const q = query.trim();
    if (q.length < minChars) return false;
    return hits.length === 0 && !loading;
  }, [createLabel, disabled, hits.length, loading, minChars, onCreate, query]);

  const dropdown = () => {
    if (!open) return null;

    const q = query.trim();
    const canShowEmpty = q.length >= minChars && !loading && hits.length === 0 && !showCreateRow;
    if (hits.length === 0 && q.length < minChars && !loading) return null;

    const content = (
      <div
        ref={dropdownRef}
        className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-auto flex flex-col"
        style={dropdownStyle}
      >
        {hits.length > 0 ? (
          hits.map((h) => (
            <button
              key={h.id}
              type="button"
              className="px-4 py-3 text-left hover:bg-blue-50 flex flex-col border-b border-gray-50 last:border-0 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(h);
                setOpen(false);
              }}
            >
              <span className="font-medium text-gray-800 truncate">{h.label}</span>
              {h.subtitle ? <span className="text-xs text-gray-500 truncate">{h.subtitle}</span> : null}
            </button>
          ))
        ) : null}

        {loading ? (
          <div className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} /> Buscando…
          </div>
        ) : null}

        {showCreateRow ? (
          <div className="border-t border-gray-100">
            <button
              type="button"
              className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                onCreate?.({ q });
                setOpen(false);
              }}
            >
              <PlusSquare className="w-4 h-4 text-blue-600" />
              <div className="min-w-0">
                <div className="font-semibold text-blue-700">{createLabel}</div>
                <div className="text-xs text-gray-500 truncate">
                  Criar “{q}” (use a busca para evitar duplicados)
                </div>
              </div>
            </button>
            {openCreateInNewTabHref ? (
              <a
                className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 transition-colors"
                href={openCreateInNewTabHref}
                target="_blank"
                rel="noreferrer"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-4 h-4 text-gray-600" />
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800">Abrir cadastro completo em nova aba</div>
                  <div className="text-xs text-gray-500 truncate">Para casos avançados.</div>
                </div>
              </a>
            ) : null}
          </div>
        ) : null}

        {canShowEmpty ? (
          <div className="px-4 py-6 text-center text-gray-500">
            <div className="font-medium">Nenhum resultado</div>
            <div className="text-xs mt-1">Tente outro termo de busca</div>
          </div>
        ) : null}
      </div>
    );

    return createPortal(content, document.body);
  };

  return (
    <div className={className || ''}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          ref={inputRef}
          className="w-full p-3 pl-10 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm outline-none"
          placeholder={placeholder ?? 'Buscar…'}
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (value) onClear?.();
          }}
          onFocus={() => {
            if (query.trim().length >= minChars && (hits.length > 0 || showCreateRow)) setOpen(true);
          }}
          disabled={disabled}
        />
        {loading ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500">
            <Loader2 className="animate-spin" size={16} />
          </div>
        ) : null}
      </div>
      {dropdown()}
    </div>
  );
}

