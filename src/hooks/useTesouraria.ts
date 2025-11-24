import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as treasuryService from '../services/treasury';
import { useAuth } from '../contexts/AuthProvider';

export const useContasCorrentes = () => {
  const { activeEmpresa } = useAuth();
  const [contas, setContas] = useState<treasuryService.ContaCorrente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [filterAtivo, setFilterAtivo] = useState<boolean | null>(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const fetchContas = useCallback(async () => {
    if (!activeEmpresa) return;
    setLoading(true);
    setError(null);
    try {
      const { data, count } = await treasuryService.listContasCorrentes({
        page,
        pageSize,
        searchTerm: debouncedSearchTerm,
        ativo: filterAtivo,
      });
      setContas(data);
      setCount(count);
    } catch (e: any) {
      setError(e.message);
      setContas([]);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresa, page, pageSize, debouncedSearchTerm, filterAtivo]);

  useEffect(() => {
    fetchContas();
  }, [fetchContas]);

  return {
    contas,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterAtivo,
    setPage,
    setSearchTerm,
    setFilterAtivo,
    refresh: fetchContas,
  };
};

export const useMovimentacoes = (contaCorrenteId: string | null) => {
  const { activeEmpresa } = useAuth();
  const [movimentacoes, setMovimentacoes] = useState<treasuryService.Movimentacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [tipoMov, setTipoMov] = useState<'entrada' | 'saida' | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const fetchMovimentacoes = useCallback(async () => {
    if (!activeEmpresa || !contaCorrenteId) {
        setMovimentacoes([]);
        return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, count } = await treasuryService.listMovimentacoes({
        contaCorrenteId,
        startDate,
        endDate,
        tipoMov,
        searchTerm: debouncedSearchTerm,
        page,
        pageSize,
      });
      setMovimentacoes(data);
      setCount(count);
    } catch (e: any) {
      setError(e.message);
      setMovimentacoes([]);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresa, contaCorrenteId, startDate, endDate, tipoMov, debouncedSearchTerm, page, pageSize]);

  useEffect(() => {
    fetchMovimentacoes();
  }, [fetchMovimentacoes]);

  return {
    movimentacoes,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    startDate,
    endDate,
    tipoMov,
    setPage,
    setSearchTerm,
    setStartDate,
    setEndDate,
    setTipoMov,
    refresh: fetchMovimentacoes,
  };
};

export const useExtratos = (contaCorrenteId: string | null) => {
  const { activeEmpresa } = useAuth();
  const [extratos, setExtratos] = useState<treasuryService.ExtratoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [filterConciliado, setFilterConciliado] = useState<boolean | null>(null); // null = all
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const fetchExtratos = useCallback(async () => {
    if (!activeEmpresa || !contaCorrenteId) {
        setExtratos([]);
        return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, count } = await treasuryService.listExtratos({
        contaCorrenteId,
        startDate,
        endDate,
        conciliado: filterConciliado,
        searchTerm: debouncedSearchTerm,
        page,
        pageSize,
      });
      setExtratos(data);
      setCount(count);
    } catch (e: any) {
      setError(e.message);
      setExtratos([]);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresa, contaCorrenteId, startDate, endDate, filterConciliado, debouncedSearchTerm, page, pageSize]);

  useEffect(() => {
    fetchExtratos();
  }, [fetchExtratos]);

  return {
    extratos,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    startDate,
    endDate,
    filterConciliado,
    setPage,
    setSearchTerm,
    setStartDate,
    setEndDate,
    setFilterConciliado,
    refresh: fetchExtratos,
  };
};
