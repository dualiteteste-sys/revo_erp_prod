import React, { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import { Loader2, Search, ChevronRight, Home } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import axios from 'axios';

interface NcmResult {
  codigo: string;
  descricao: string;
  data_inicio_vigencia: string;
  data_fim_vigencia: string;
  ato_legal: string;
  ano_ato_legal: string;
}

interface NcmSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (ncm: string) => void;
}

const NcmSearchModal: React.FC<NcmSearchModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [history, setHistory] = useState<{ code: string; description: string }[]>([]);
  const [results, setResults] = useState<NcmResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const fetchNcmData = useCallback(async (code: string, isSearch: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const url = isSearch
        ? `https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(code)}`
        : `https://brasilapi.com.br/api/ncm/v1/${code}`;
      
      const response = await axios.get(url);
      
      const rawData = Array.isArray(response.data) ? response.data : [response.data].filter(Boolean);
      
      // FIX: Deduplicate results to prevent React key errors
      const uniqueData = Array.from(new Map(rawData.map((item: NcmResult) => [item.codigo, item])).values());

      if (uniqueData.length === 0) {
        setResults([]);
        setError(isSearch ? "Nenhum resultado encontrado." : "Não há mais sub-itens para esta categoria.");
      } else {
        setResults(uniqueData);
      }
    } catch (e) {
      console.error("NCM Search Error:", e);
      setError('Nenhum resultado encontrado ou falha na busca.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Effect for text search
  useEffect(() => {
    if (debouncedSearchTerm.length > 2) {
      setHistory([]);
      fetchNcmData(debouncedSearchTerm, true);
    } else if (debouncedSearchTerm.length === 0 && history.length === 0) {
      setResults([]);
      setError(null);
    }
  }, [debouncedSearchTerm, fetchNcmData]);

  // Effect for drill-down (triggered by history change)
  useEffect(() => {
    if (history.length > 0 && searchTerm === '') {
        const currentCode = history[history.length - 1].code;
        fetchNcmData(currentCode, false);
    }
  }, [history, searchTerm, fetchNcmData]);

  const handleDrillDown = (item: NcmResult) => {
    setSearchTerm(''); // Clear search term to allow history effect to trigger
    setHistory(prev => [...prev, { code: item.codigo, description: item.descricao }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const newHistory = history.slice(0, index + 1);
    setSearchTerm('');
    setHistory(newHistory);
  };

  const resetSearch = () => {
    setSearchTerm('');
    setHistory([]);
    setResults([]);
    setError(null);
  };

  const handleSelectNcm = (item: NcmResult) => {
    onSelect(item.codigo);
    onClose();
  };

  const renderItem = (item: NcmResult) => {
    const isSelectable = item.codigo.length === 8;
    return (
      <div
        key={`${item.codigo}-${item.descricao}`} // Use a more unique key
        onClick={() => (isSelectable ? handleSelectNcm(item) : handleDrillDown(item))}
        className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
          isSelectable
            ? 'cursor-pointer hover:bg-blue-100'
            : 'cursor-pointer hover:bg-gray-100'
        }`}
      >
        <div className="flex-1 overflow-hidden">
          <p className={`font-medium truncate ${isSelectable ? 'text-blue-700' : 'text-gray-800'}`}>
            {item.codigo}
          </p>
          <p className="text-sm text-gray-600 truncate">{item.descricao}</p>
        </div>
        {!isSelectable && <ChevronRight className="text-gray-400 flex-shrink-0" />}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Buscar NCM Inteligente" size="4xl">
      <div className="p-6 flex flex-col h-[70vh]">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Digite o nome ou código do produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 overflow-x-auto pb-2 scrollbar-styled">
          <button onClick={resetSearch} className="hover:underline flex items-center gap-1 flex-shrink-0">
            <Home size={14} /> Início
          </button>
          {history.map((item, index) => (
            <React.Fragment key={item.code}>
              <ChevronRight size={14} className="flex-shrink-0" />
              <button onClick={() => handleBreadcrumbClick(index)} className="hover:underline truncate max-w-[150px]">
                {item.code}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2 scrollbar-styled">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
          ) : error ? (
            <div className="text-center text-red-500 p-4">{error}</div>
          ) : results.length > 0 ? (
            <div className="space-y-2">{results.map(renderItem)}</div>
          ) : (
            <div className="text-center text-gray-500 p-8">
              <p>Nenhum resultado para exibir.</p>
              <p className="text-sm">Use a busca acima ou navegue pelas categorias.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default NcmSearchModal;
