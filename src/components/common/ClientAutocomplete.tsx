import React, { useEffect, useRef, useState } from 'react';
import { searchClients, ClientHit } from '@/services/clients';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2 } from 'lucide-react';

type Props = {
  value: string | null;
  onChange: (id: string | null, name?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  initialName?: string;
};

export default function ClientAutocomplete({ value, onChange, placeholder, disabled, className, initialName }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<ClientHit[]>([]);
  const ref = useRef<HTMLDivElement>(null);

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
      if (debouncedQuery.length < 2) {
        setHits([]);
        return;
      }
      if (value && query === initialName) {
        return;
      }

      setLoading(true);
      try {
        const res = await searchClients(debouncedQuery, 20);
        setHits(res);
        setOpen(true);
      } catch (e) {
        console.error('[RPC][ERROR] search_clients_for_current_user', e);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [debouncedQuery, value, initialName]);

  const handleSelect = (hit: ClientHit) => {
    setQuery(hit.label);
    onChange(hit.id, hit.label);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    if (value) {
      onChange(null);
    }
  };

  return (
    <div className={`relative ${className || ''}`} ref={ref}>
      <input
        className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
        placeholder={placeholder ?? 'Nome/CPF/CNPJ...'}
        value={query}
        onChange={handleInputChange}
        onFocus={() => { if (query.length >= 2 && hits.length) setOpen(true); }}
        disabled={disabled}
      />
      {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500"><Loader2 className="animate-spin" size={16} /></div>}
      {open && hits.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
          {hits.map(h => (
            <div
              key={h.id}
              className="px-4 py-3 cursor-pointer hover:bg-blue-50"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(h);
              }}
            >
              <p className="font-medium text-gray-800">{h.nome}</p>
              <p className="text-sm text-gray-500">{h.doc_unico}</p>
            </div>
          ))}
        </div>
      )}
      {open && !loading && hits.length === 0 && query.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow px-4 py-3 text-sm text-gray-500">
          Nenhum cliente encontrado.
        </div>
      )}
    </div>
  );
}
