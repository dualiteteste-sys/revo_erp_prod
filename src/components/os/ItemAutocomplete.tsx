import React, { useEffect, useRef, useState } from 'react';
import { searchItemsForOs, OsItemSearchResult } from '@/services/os';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2, Search, Wrench, Package } from 'lucide-react';

type Props = {
  onSelect: (item: OsItemSearchResult) => void;
  disabled?: boolean;
};

export default function ItemAutocomplete({ onSelect, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OsItemSearchResult[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

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
      if (debouncedQuery.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const data = await searchItemsForOs(debouncedQuery, 20);
        setResults(data);
        setOpen(true);
      } catch (e) {
        console.error('[RPC][ERROR] search_items_for_os', e);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [debouncedQuery]);

  const handleSelect = (item: OsItemSearchResult) => {
    onSelect(item);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          className="w-full p-3 pl-10 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
          placeholder="Buscar produto ou serviço para adicionar..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (query.length >= 2 && results.length) setOpen(true); }}
          disabled={disabled}
        />
        {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><Loader2 className="animate-spin" size={16} /></div>}
      </div>
      
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-80 overflow-auto">
          {results.map(item => (
            <div
              key={`${item.type}-${item.id}`}
              className="px-4 py-3 cursor-pointer hover:bg-blue-50 flex items-center gap-3"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
            >
              {item.type === 'service' ? <Wrench size={16} className="text-gray-500 flex-shrink-0" /> : <Package size={16} className="text-gray-500 flex-shrink-0" />}
              <div className="flex-grow overflow-hidden">
                <p className="font-medium text-gray-800 truncate">{item.descricao}</p>
                <p className="text-sm text-gray-500 truncate">
                    {item.codigo && `Código: ${item.codigo} | `}
                    Preço: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.preco_venda) || 0)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow px-4 py-3 text-sm text-gray-500">
          Nenhum item encontrado.
        </div>
      )}
    </div>
  );
}
