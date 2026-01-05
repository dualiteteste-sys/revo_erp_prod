import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

import { useDebounce } from '@/hooks/useDebounce';
import { searchCentrosDeCusto, type CentroDeCustoListItem } from '@/services/centrosDeCusto';

type Props = {
  value: string | null;
  initialName?: string;
  onChange: (id: string | null, name?: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export default function CentroDeCustoAutocomplete({ value, initialName, onChange, disabled, placeholder }: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CentroDeCustoListItem[]>([]);
  const [open, setOpen] = useState(false);

  const debounced = useDebounce(search, 300);

  useEffect(() => {
    if (initialName && !search) {
      setSearch(initialName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialName, value]);

  useEffect(() => {
    let canceled = false;

    const run = async () => {
      if (disabled) return;
      const q = debounced.trim();
      if (q.length < 2) {
        setResults([]);
        return;
      }
      const rows = await searchCentrosDeCusto(q);
      if (canceled) return;
      setResults(rows);
      setOpen(true);
    };

    void run();
    return () => {
      canceled = true;
    };
  }, [debounced, disabled]);

  const handleSelect = (row: CentroDeCustoListItem) => {
    onChange(row.id, row.nome);
    setSearch(row.nome);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSearch('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder || 'Buscar centro de custo…'}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60"
        />
        {value || search ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={handleClear}
            disabled={disabled}
            title="Limpar"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
            >
              <div className="font-medium text-gray-800">{r.nome}</div>
              <div className="text-xs text-gray-500">{r.codigo ? `Código ${r.codigo}` : `Tipo ${r.tipo}`}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
