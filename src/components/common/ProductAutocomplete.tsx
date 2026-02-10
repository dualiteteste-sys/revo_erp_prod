import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { getProducts, type Product } from '@/services/products';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthProvider';

type Hit = {
  id: string;
  nome: string;
  unidade: string | null;
  preco_venda: number | null;
  sku: string | null;
};

type Props = {
  value: string | null;
  onChange: (id: string | null, hit?: Hit) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  initialName?: string;
};

function toHit(p: Product): Hit {
  return {
    id: p.id,
    nome: p.nome || 'Produto',
    unidade: p.unidade ?? null,
    preco_venda: p.preco_venda ?? null,
    sku: p.sku ?? null,
  };
}

export default function ProductAutocomplete({ value, onChange, placeholder, disabled, className, initialName }: Props) {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const searchSeqRef = useRef(0);

  const debouncedQuery = useDebounce(query, 250);

  useEffect(() => {
    if (value && initialName) {
      setQuery(initialName);
    } else if (!value) {
      setQuery('');
    }
  }, [value, initialName]);

  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  useEffect(() => {
    const search = async () => {
      if (authLoading || !activeEmpresaId) return;
      if (debouncedQuery.length < 2) {
        searchSeqRef.current += 1;
        setHits([]);
        return;
      }
      if (value) return;

      const seq = ++searchSeqRef.current;
      setLoading(true);
      try {
        const res = await getProducts({
          page: 1,
          pageSize: 20,
          searchTerm: debouncedQuery,
          status: 'ativo',
          sortBy: { column: 'nome', ascending: true },
        });
        if (seq !== searchSeqRef.current) return;
        setHits((res.data || []).map(toHit));
        setOpen(true);
      } catch (error) {
        if (seq !== searchSeqRef.current) return;
        logger.warn('[ProductAutocomplete] Falha ao buscar produtos', { error });
      } finally {
        if (seq === searchSeqRef.current) setLoading(false);
      }
    };
    void search();
  }, [debouncedQuery, value, authLoading, activeEmpresaId]);

  const handleSelect = (hit: Hit) => {
    setQuery(hit.nome);
    onChange(hit.id, hit);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (authLoading || !activeEmpresaId) return;
    const next = e.target.value;
    setQuery(next);
    if (value) onChange(null);
  };

  return (
    <div className={`relative ${className || ''}`} ref={ref}>
      <div className="relative">
        <input
          className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
          placeholder={placeholder ?? 'Nome/SKU...'}
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (!authLoading && !!activeEmpresaId && query.length >= 2 && hits.length) setOpen(true);
          }}
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
                className="px-4 py-3 cursor-pointer hover:bg-blue-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(h);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-gray-800">{h.nome}</p>
                  {h.sku && <span className="text-xs text-gray-500">{h.sku}</span>}
                </div>
                <p className="text-xs text-gray-500">
                  {h.unidade ? `Un: ${h.unidade}` : 'Unidade: —'}
                  {typeof h.preco_venda === 'number' ? ` • Preço: R$ ${h.preco_venda.toFixed(2)}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}

        {open && !loading && hits.length === 0 && query.length >= 2 && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow px-4 py-3 text-sm text-gray-500">
            Nenhum produto encontrado.
          </div>
        )}
      </div>
    </div>
  );
}
