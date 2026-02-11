import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { FISCAL_COUNTRY_CODES } from '@/lib/fiscalCountryCodes';

type Hit = { codigo: string; nome: string };

type Props = {
  value: string | null | undefined;
  onChange: (codigo: string | null, hit?: Hit) => void;
  disabled?: boolean;
  className?: string;
};

function normalizeQuery(q: string): string {
  return q
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function FiscalCountryCodeAutocomplete({ value, onChange, disabled, className }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const searchSeqRef = useRef(0);

  const debouncedQuery = useDebounce(query, 200);

  const selected = useMemo(() => {
    const code = String(value || '').replace(/\D/g, '');
    if (!code) return null;
    return FISCAL_COUNTRY_CODES.find((c) => c.codigo === code) ?? null;
  }, [value]);

  useEffect(() => {
    if (selected) setQuery(`${selected.nome} (${selected.codigo})`);
    else if (!value) setQuery('');
  }, [selected, value]);

  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  useEffect(() => {
    const search = () => {
      if (disabled) return;
      if (value && selected) return;
      const q = (debouncedQuery ?? '').trim();
      if (q.length < 1) {
        searchSeqRef.current += 1;
        setHits([]);
        return;
      }

      const seq = ++searchSeqRef.current;
      setLoading(true);
      try {
        const nq = normalizeQuery(q);
        const digits = q.replace(/\D/g, '');
        const res = FISCAL_COUNTRY_CODES.filter((c) => {
          if (digits && c.codigo.startsWith(digits)) return true;
          return normalizeQuery(c.nome).includes(nq);
        })
          .slice(0, 25)
          .map((c) => ({ codigo: c.codigo, nome: c.nome }));
        if (seq !== searchSeqRef.current) return;
        setHits(res);
        setOpen(true);
      } finally {
        if (seq === searchSeqRef.current) {
          setLoading(false);
        }
      }
    };
    search();
  }, [debouncedQuery, disabled, value, selected]);

  const handleSelect = (hit: Hit) => {
    setQuery(`${hit.nome} (${hit.codigo})`);
    onChange(hit.codigo, hit);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setQuery(next);
    if (value) onChange(null);
  };

  return (
    <div className={`relative ${className || ''}`} ref={ref}>
      <div className="relative">
        <input
          className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
          placeholder="Brasil (1058)"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (!disabled && query.length >= 1 && hits.length) setOpen(true);
          }}
          disabled={disabled}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
            <Loader2 className="animate-spin" size={16} />
          </div>
        )}

        {open && hits.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
            {hits.map((h) => (
              <div
                key={h.codigo}
                className="px-4 py-3 cursor-pointer hover:bg-blue-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(h);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-gray-800">{h.nome}</p>
                  <span className="text-xs text-gray-500">{h.codigo}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {open && !loading && hits.length === 0 && query.trim().length >= 1 && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow px-4 py-3 text-sm text-gray-500">
            Nenhum país encontrado.
          </div>
        )}
      </div>
    </div>
  );
}

