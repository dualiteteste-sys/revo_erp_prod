import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as cobrancasService from '../services/cobrancas';
import { useAuth } from '../contexts/AuthProvider';

export const useCobrancas = () => {
  const { activeEmpresa } = useAuth();
  const [cobrancas, setCobrancas] = useState<cobrancasService.CobrancaBancaria[]>([]);
  const [summary, setSummary] = useState<cobrancasService.CobrancaSummary>({
    pendentes: 0,
    em_aberto: 0,
    liquidadas: 0,
    baixadas: 0,
    com_erro: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const [filterStatus, setFilterStatus] = useState<cobrancasService.StatusCobranca | null>(null);
  const [startVenc, setStartVenc] = useState<Date | null>(null);
  const [endVenc, setEndVenc] = useState<Date | null>(null);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchCobrancas = useCallback(async () => {
    if (!activeEmpresa) {
      setCobrancas([]);
      setCount(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [{ data, count }, summaryData] = await Promise.all([
        cobrancasService.listCobrancas({
          page,
          pageSize,
          searchTerm: debouncedSearchTerm,
          status: filterStatus,
          startVenc,
          endVenc,
        }),
        cobrancasService.getCobrancasSummary(startVenc, endVenc),
      ]);
      setCobrancas(data);
      setCount(count);
      setSummary(summaryData);
    } catch (e: any) {
      setError(e.message);
      setCobrancas([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearchTerm, filterStatus, startVenc, endVenc, activeEmpresa]);

  useEffect(() => {
    fetchCobrancas();
  }, [fetchCobrancas]);

  const refresh = () => {
    fetchCobrancas();
  };

  return {
    cobrancas,
    summary,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    startVenc,
    endVenc,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterStatus,
    setStartVenc,
    setEndVenc,
    refresh,
  };
};
