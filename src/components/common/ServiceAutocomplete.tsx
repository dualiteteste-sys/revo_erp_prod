import React, { useEffect, useRef, useState } from 'react';
import { listServices, Service } from '@/services/services';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2, Search, Wrench } from 'lucide-react';

type Props = {
  value: string | null;
  onChange: (id: string | null, service?: Service) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  initialName?: string;
};

export default function ServiceAutocomplete({ 
  value, 
  onChange, 
  placeholder, 
  disabled, 
  className, 
  initialName 
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Service[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Sincroniza o input com o nome inicial se fornecido e se não houver query digitada
  useEffect(() => {
    if (value && initialName && query === '') {
      setQuery(initialName);
    } else if (!value && query !== '' && document.activeElement !== ref.current?.querySelector('input')) {
      // Limpa query se valor for resetado externamente e não estiver focado
      setQuery('');
    }
  }, [value, initialName]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  // Busca serviços
  useEffect(() => {
    const search = async () => {
      // Não busca se a query for muito curta ou se for igual ao nome inicial (evita busca ao carregar form)
      if (debouncedQuery.length < 2) {
        setResults([]);
        return;
      }
      
      if (value && debouncedQuery === initialName) {
        return;
      }

      setLoading(true);
      try {
        // Busca exclusiva na tabela de serviços
        const data = await listServices({
          search: debouncedQuery,
          limit: 20,
          orderBy: 'descricao',
          orderDir: 'asc'
        });
        setResults(data);
        setOpen(true);
      } catch (e) {
        console.error('[ServiceAutocomplete] Erro ao buscar serviços', e);
      } finally {
        setLoading(false);
      }
    };

    search();
  }, [debouncedQuery, value, initialName]);

  const handleSelect = (service: Service) => {
    setQuery(service.descricao);
    onChange(service.id, service);
    setOpen(false);
    setResults([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (value) {
      // Se o usuário altera o texto, limpamos a seleção anterior até que ele selecione novamente
      onChange(null);
    }
    if (!open && e.target.value.length >= 2) {
        setOpen(true);
    }
  };

  const handleFocus = () => {
    if (query.length >= 2 && results.length > 0) {
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
          placeholder={placeholder ?? 'Buscar serviço...'}
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          disabled={disabled}
        />
      </div>
      
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-auto">
          {results.map(service => (
            <div
              key={service.id}
              className="px-4 py-3 cursor-pointer hover:bg-blue-50 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors"
              onMouseDown={(e) => {
                // onMouseDown previne que o input perca o foco antes do click ser registrado
                e.preventDefault();
                handleSelect(service);
              }}
            >
              <div className="bg-blue-100 p-2 rounded-full flex-shrink-0">
                <Wrench size={16} className="text-blue-600" />
              </div>
              <div className="flex-grow overflow-hidden">
                <p className="font-medium text-gray-800 truncate">{service.descricao}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    {service.codigo && <span>Cód: {service.codigo}</span>}
                    {service.preco_venda && (
                        <span>
                            • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(service.preco_venda))}
                        </span>
                    )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow px-4 py-3 text-sm text-gray-500">
          Nenhum serviço encontrado.
        </div>
      )}
    </div>
  );
}
