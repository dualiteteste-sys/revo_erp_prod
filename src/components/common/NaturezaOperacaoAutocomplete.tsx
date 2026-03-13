import React, { useEffect, useRef, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { logger } from '@/lib/logger';
import {
  fiscalNaturezasOperacaoSearch,
  type NaturezaOperacaoSearchHit,
} from '@/services/fiscalNaturezasOperacao';

type Props = {
  value: string | null;
  onChange: (id: string | null, hit?: NaturezaOperacaoSearchHit) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  initialName?: string;
};

export default function NaturezaOperacaoAutocomplete({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  initialName,
}: Props) {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<NaturezaOperacaoSearchHit[]>([]);
  const ref = useRef<HTMLDivElement>(null);
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  useEffect(() => {
    const search = async () => {
      if (authLoading || !activeEmpresaId) return;
      if (debouncedQuery.length < 1) {
        searchSeqRef.current += 1;
        setHits([]);
        return;
      }
      if (value) return;

      const seq = ++searchSeqRef.current;
      setLoading(true);
      try {
        const res = await fiscalNaturezasOperacaoSearch(debouncedQuery, 15);
        if (seq !== searchSeqRef.current) return;
        setHits(res ?? []);
        setOpen(true);
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('[RPC][ERROR] fiscal_naturezas_operacao_search', { error: msg });
      } finally {
        if (seq === searchSeqRef.current) setLoading(false);
      }
    };
    search();
  }, [debouncedQuery, value, authLoading, activeEmpresaId]);

  const handleSelect = (hit: NaturezaOperacaoSearchHit) => {
    setQuery(hit.descricao);
    onChange(hit.id, hit);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (authLoading || !activeEmpresaId) return;
    const newQuery = e.target.value;
    setQuery(newQuery);
    if (value) {
      onChange(null);
    }
  };

  // Allow loading full list on focus with empty query
  const handleFocus = async () => {
    if (authLoading || !activeEmpresaId || value) return;
    if (hits.length > 0) {
      setOpen(true);
      return;
    }
    // Load all on focus
    const seq = ++searchSeqRef.current;
    setLoading(true);
    try {
      const res = await fiscalNaturezasOperacaoSearch('', 30);
      if (seq !== searchSeqRef.current) return;
      setHits(res ?? []);
      setOpen(true);
    } catch {
      // ignore
    } finally {
      if (seq === searchSeqRef.current) setLoading(false);
    }
  };

  return (
    <div className={`relative ${className || ''}`} ref={ref}>
      <div className="relative">
        <input
          className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
          placeholder={placeholder ?? 'Buscar natureza de operação...'}
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          disabled={disabled || authLoading || !activeEmpresaId}
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
                key={h.id}
                className="px-4 py-3 cursor-pointer hover:bg-blue-50 border-b border-slate-50 last:border-0"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(h);
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-800 text-sm">{h.descricao}</p>
                  <span className="text-xs font-mono text-slate-500 ml-2">{h.codigo}</span>
                </div>
                <div className="flex gap-3 mt-0.5 text-xs text-slate-500">
                  {h.cfop_dentro_uf && <span>CFOP: {h.cfop_dentro_uf}/{h.cfop_fora_uf || '—'}</span>}
                  {(h.icms_cst || h.icms_csosn) && (
                    <span>ICMS: {h.icms_cst ? `CST ${h.icms_cst}` : `CSOSN ${h.icms_csosn}`}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {open && !loading && hits.length === 0 && query.length >= 1 && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg overflow-hidden">
            <div className="px-4 py-3 text-sm text-gray-500">Nenhuma natureza encontrada.</div>
          </div>
        )}
      </div>
    </div>
  );
}
