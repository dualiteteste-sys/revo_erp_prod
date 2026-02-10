import React, { useEffect, useRef, useState } from 'react';
import { listMateriaisCliente, MaterialClienteListItem } from '@/services/industriaMateriais';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2, Search, Package } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthProvider';

type Props = {
  clienteId?: string | null;
  value: string | null;
  initialName?: string;
  onChange: (material: MaterialClienteListItem | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export default function MaterialClienteAutocomplete({ 
  clienteId, 
  value, 
  initialName, 
  onChange, 
  disabled, 
  placeholder,
  className 
}: Props) {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MaterialClienteListItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Sync initial name
  useEffect(() => {
    if (value && initialName && query === '') {
      setQuery(initialName);
    } else if (!value && query !== '' && document.activeElement !== ref.current?.querySelector('input')) {
      setQuery('');
    }
  }, [value, initialName]);

  // Close on click outside
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  // Search effect
  useEffect(() => {
    const search = async () => {
      if (disabled || authLoading || !activeEmpresaId) return;
      
      // Don't search if query matches initial name (avoid search on load)
      if (value && query === initialName) return;

      setLoading(true);
      try {
        // If query is empty but we have focus, we might want to show some default/recent items
        // For now, we search if query > 1 char OR if it's empty but we want to show list for specific client
        if (query.length < 1 && !clienteId) {
            setResults([]);
            return;
        }

        const { data } = await listMateriaisCliente(query, clienteId || undefined, true, 1, 20);
        setResults(data);
        if (data.length > 0) setOpen(true);
      } catch (e) {
        logger.error('[Indústria][Materiais do Cliente] Falha ao buscar materiais (autocomplete)', e, { query, clienteId });
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [debouncedQuery, clienteId, disabled, value, initialName, authLoading, activeEmpresaId]);

  const handleSelect = (item: MaterialClienteListItem) => {
    setQuery(item.nome_cliente || item.produto_nome);
    onChange(item);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (authLoading || !activeEmpresaId) return;
    setQuery(e.target.value);
    if (value) {
      onChange(null); // Clear selection if user types
    }
    if (!open) setOpen(true);
  };

  const handleFocus = () => {
    if (!disabled && !authLoading && !!activeEmpresaId && !open) {
        // Trigger search on focus to show options if client is selected
        setQuery(prev => prev); 
        setOpen(true);
    }
  };

  return (
    <div className={`relative ${className || ''}`} ref={ref}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {loading ? <Loader2 className="animate-spin text-blue-500" size={18} /> : <Search className="text-gray-400" size={18} />}
        </div>
        <input
          type="text"
          className="w-full pl-10 p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
          placeholder={placeholder ?? (clienteId ? 'Buscar material do cliente...' : 'Selecione um cliente primeiro')}
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          disabled={disabled || authLoading || !activeEmpresaId}
        />
      </div>
      
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-auto">
          {results.map(item => (
            <div
              key={item.id}
              className="px-4 py-3 cursor-pointer hover:bg-blue-50 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
            >
              <div className="bg-purple-100 p-2 rounded-full flex-shrink-0">
                <Package size={16} className="text-purple-600" />
              </div>
              <div className="flex-grow overflow-hidden">
                <p className="font-medium text-gray-800 truncate">{item.nome_cliente || item.produto_nome}</p>
                <div className="flex flex-col text-xs text-gray-500">
                    {item.codigo_cliente && <span>Cód. Cliente: {item.codigo_cliente}</span>}
                    <span>Interno: {item.produto_nome}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow px-4 py-3 text-sm text-gray-500">
          Nenhum material encontrado.
        </div>
      )}
    </div>
  );
}
