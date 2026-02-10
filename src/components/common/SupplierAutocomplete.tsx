import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchSuppliers, SupplierHit } from '@/services/compras';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';

type Props = {
  value: string | null;
  onChange: (id: string | null, name?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  initialName?: string;
};

export default function SupplierAutocomplete({ value, onChange, placeholder, disabled, className, initialName }: Props) {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SupplierHit[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastErrorToastAt = useRef<number>(0);
  const searchSeqRef = useRef(0);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (value && initialName) {
      setQuery(initialName);
    } else if (!value) {
      setQuery('');
    }
  }, [value, initialName]);

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
      if (authLoading || !activeEmpresaId) return;
      const q = debouncedQuery.trim();
      if (q.length < 2) {
        searchSeqRef.current += 1;
        setHits([]);
        setErrorText(null);
        setOpen(false);
        return;
      }

      if (value && query === initialName) return;
      if (value) return;

      const seq = ++searchSeqRef.current;
      setLoading(true);
      setErrorText(null);
      try {
        const res = await searchSuppliers(q);
        if (seq !== searchSeqRef.current) return;
        setHits(res);
        setOpen(true);
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        console.error(e);
        setHits([]);
        setErrorText('Não foi possível buscar fornecedores agora. Tente novamente.');
        setOpen(true);
        const now = Date.now();
        if (now - lastErrorToastAt.current > 4000) {
          lastErrorToastAt.current = now;
          addToast('Erro ao buscar fornecedores. Tente novamente.', 'error');
        }
      } finally {
        if (seq === searchSeqRef.current) setLoading(false);
      }
    };
    void doSearch();
  }, [debouncedQuery, value, initialName, query, authLoading, activeEmpresaId]);

  const handleSelect = (hit: SupplierHit) => {
    setQuery(hit.label);
    onChange(hit.id, hit.label);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (authLoading || !activeEmpresaId) return;
    const next = e.target.value;
    setQuery(next);
    if (value) onChange(null);
    if (next.trim().length >= 2) setOpen(true);
  };

  const dropdown = () => {
    if (!open) return null;
    const q = query.trim();
    if (q.length < 2 && !loading) return null;

    const content = (
      <div
        ref={dropdownRef}
        className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-auto flex flex-col"
        style={dropdownStyle}
      >
        {errorText ? (
          <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">
            {errorText}
          </div>
        ) : null}

        {hits.length > 0 ? (
          hits.map((h) => (
            <button
              key={h.id}
              type="button"
              className="px-4 py-3 text-left hover:bg-blue-50 flex flex-col border-b border-gray-50 last:border-0 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(h);
              }}
            >
              <span className="font-medium text-gray-800 truncate">{h.nome}</span>
              {h.doc_unico ? <span className="text-xs text-gray-500 truncate">{h.doc_unico}</span> : null}
            </button>
          ))
        ) : null}

        {loading ? (
          <div className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} /> Buscando…
          </div>
        ) : null}

        {!loading && !errorText && hits.length === 0 && q.length >= 2 ? (
          <div className="px-4 py-6 text-center text-gray-500">
            <div className="font-medium">Nenhum fornecedor encontrado</div>
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
        <input
          ref={inputRef}
          className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm outline-none"
          placeholder={placeholder ?? 'Buscar fornecedor...'}
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (!authLoading && !!activeEmpresaId && query.trim().length >= 2) setOpen(true);
          }}
          disabled={disabled || authLoading || !activeEmpresaId}
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
