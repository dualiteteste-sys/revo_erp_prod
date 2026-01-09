import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as extratoService from '../services/extrato';
import { useAuth } from '../contexts/AuthProvider';

export const useExtrato = (initialContaId?: string | null) => {
  const { activeEmpresa } = useAuth();
  const [lancamentos, setLancamentos] = useState<extratoService.ExtratoLancamento[]>([]);
  const [summary, setSummary] = useState<extratoService.ExtratoSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [contaCorrenteId, setContaCorrenteId] = useState<string | null>(initialContaId || null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [tipoLancamento, setTipoLancamento] = useState<'credito' | 'debito' | null>(null);
  const [conciliado, setConciliado] = useState<boolean | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const fetchExtrato = useCallback(async () => {
    if (!activeEmpresa) {
      setLancamentos([]);
      setCount(0);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Parallel fetch for list and summary (if account selected)
      const promises: Promise<any>[] = [
        extratoService.listExtrato({
          page,
          pageSize,
          contaCorrenteId,
          startDate,
          endDate,
          tipoLancamento,
          conciliado,
          searchTerm: debouncedSearchTerm,
        })
      ];

      if (contaCorrenteId) {
        promises.push(extratoService.getExtratoSummary(contaCorrenteId, startDate, endDate));
      } else {
        setSummary(null);
      }

      const results = await Promise.all(promises);
      const listResult = results[0];
      
      setLancamentos(listResult.data);
      setCount(listResult.count);

      if (results[1]) {
        setSummary(results[1]);
      }

    } catch (e: any) {
      setError(e.message);
      setLancamentos([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresa, page, pageSize, contaCorrenteId, startDate, endDate, tipoLancamento, conciliado, debouncedSearchTerm]);

  useEffect(() => {
    fetchExtrato();
  }, [fetchExtrato]);

  const refresh = () => {
    fetchExtrato();
  };

  return {
    lancamentos,
    summary,
    loading,
    error,
    count,
    page,
    pageSize,
    contaCorrenteId,
    startDate,
    endDate,
    tipoLancamento,
    conciliado,
    searchTerm,
    setPage,
    setPageSize,
    setContaCorrenteId,
    setStartDate,
    setEndDate,
    setTipoLancamento,
    setConciliado,
    setSearchTerm,
    refresh,
  };
};
