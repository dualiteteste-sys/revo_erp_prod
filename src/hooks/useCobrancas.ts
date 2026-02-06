import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from './useDebounce';
import * as cobrancasService from '../services/cobrancas';
import { useAuth } from '../contexts/AuthProvider';

export const useCobrancas = () => {
  const { activeEmpresa } = useAuth();
  const empresaId = activeEmpresa?.id ?? null;
  const lastEmpresaIdRef = useRef<string | null>(empresaId);
  const fetchTokenRef = useRef(0);
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

  useEffect(() => {
    const prev = lastEmpresaIdRef.current;
    if (prev === empresaId) return;

    // Multi-tenant safety: limpar imediatamente o estado ao trocar de empresa.
    setCobrancas([]);
    setSummary({
      pendentes: 0,
      em_aberto: 0,
      liquidadas: 0,
      baixadas: 0,
      com_erro: 0,
    });
    setError(null);
    setCount(0);
    setPage(1);
    setLoading(false);

    lastEmpresaIdRef.current = empresaId;
  }, [empresaId]);

  const fetchCobrancas = useCallback(async () => {
    if (!activeEmpresa) {
      setCobrancas([]);
      setSummary({
        pendentes: 0,
        em_aberto: 0,
        liquidadas: 0,
        baixadas: 0,
        com_erro: 0,
      });
      setCount(0);
      return;
    }

    const token = ++fetchTokenRef.current;
    const empresaIdSnapshot = activeEmpresa.id;
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
      if (token !== fetchTokenRef.current) return;
      if (empresaIdSnapshot !== lastEmpresaIdRef.current) return;
      setCobrancas(data);
      setCount(count);
      setSummary(summaryData);
    } catch (e: any) {
      if (token !== fetchTokenRef.current) return;
      setError(e.message);
      setCobrancas([]);
      setCount(0);
    } finally {
      if (token !== fetchTokenRef.current) return;
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
