import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchItemsForOs, OsItemSearchResult } from '@/services/os';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2, Search, Wrench, Package } from 'lucide-react';

type Props = {
  onSelect: (item: OsItemSearchResult) => void;
  disabled?: boolean;
  onlySales?: boolean;
  placeholder?: string;
  type?: 'all' | 'product' | 'service';
};

export default function ItemAutocomplete({ onSelect, disabled, onlySales = true, placeholder, type = 'all' }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OsItemSearchResult[]>([]);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Close on click outside
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

  // Update dropdown position
  useEffect(() => {
    if (open && inputRef.current) {
      const updatePosition = () => {
        if (!inputRef.current) return;
        const rect = inputRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom - 10; // 10px padding bottom

        setDropdownStyle({
          position: 'fixed',
          top: `${rect.bottom + 4}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          maxHeight: `${Math.max(200, spaceBelow)}px`, // At least 200px, or available space
          zIndex: 9999,
        });
      };

      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [open, results]);

  useEffect(() => {
    const search = async () => {
      if (debouncedQuery.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const data = await searchItemsForOs(debouncedQuery, 20, onlySales, type);
        setResults(data);
        setOpen(true);
      } catch (e) {
        console.error('[ItemAutocomplete] Error:', e);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [debouncedQuery, onlySales, type]);

  const handleSelect = (item: OsItemSearchResult) => {
    onSelect(item);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const renderDropdown = () => {
    if (!open || (results.length === 0 && query.length < 2)) return null;

    const content = (
      <div
        ref={dropdownRef}
        className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-auto flex flex-col"
        style={dropdownStyle}
      >
        {results.length > 0 ? (
          results.map(item => (
            <div
              key={`${item.type}-${item.id}`}
              className="px-4 py-3 cursor-pointer hover:bg-blue-50 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
            >
              {item.type === 'service' ? (
                <div className="p-2 bg-amber-100 rounded-full text-amber-600">
                  <Wrench size={16} />
                </div>
              ) : (
                <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                  <Package size={16} />
                </div>
              )}
              <div className="flex-grow overflow-hidden">
                <p className="font-medium text-gray-800 truncate">{item.descricao}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {item.codigo && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono">{item.codigo}</span>}
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.preco_venda) || 0)}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          !loading && query.length >= 2 && (
            <div className="px-4 py-8 text-center text-gray-500">
              <p className="font-medium">Nenhum item encontrado</p>
              <p className="text-xs mt-1">Tente outro termo de busca</p>
            </div>
          )
        )}
      </div>
    );

    return createPortal(content, document.body);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          ref={inputRef}
          className="w-full p-3 pl-10 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm outline-none"
          placeholder={placeholder || "Buscar produto ou serviço..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (query.length >= 2 && results.length) setOpen(true); }}
          disabled={disabled}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500">
            <Loader2 className="animate-spin" size={16} />
          </div>
        )}
      </div>
      {renderDropdown()}
    </div>
  );
}
