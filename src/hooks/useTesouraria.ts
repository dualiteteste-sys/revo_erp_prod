import { useState } from 'react';
import { useDebounce } from './useDebounce';
import * as treasuryService from '../services/treasury';
import { useAuth } from '../contexts/AuthProvider';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

export const TESOURARIA_KEYS = {
  contas: {
    all: ['contas'] as const,
    list: (filters: any) => [...TESOURARIA_KEYS.contas.all, 'list', filters] as const,
  },
  movimentacoes: {
    all: ['movimentacoes'] as const,
    list: (filters: any) => [...TESOURARIA_KEYS.movimentacoes.all, 'list', filters] as const,
  },
  extratos: {
    all: ['extratos'] as const,
    list: (filters: any) => [...TESOURARIA_KEYS.extratos.all, 'list', filters] as const,
  }
};

export const useContasCorrentes = () => {
  const { activeEmpresa } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [filterAtivo, setFilterAtivo] = useState<boolean | null>(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const queryOptions = {
    page,
    pageSize,
    searchTerm: debouncedSearchTerm,
    ativo: filterAtivo,
  };

  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: TESOURARIA_KEYS.contas.list({ ...queryOptions, empresaId: activeEmpresa?.id }),
    queryFn: () => {
      if (!activeEmpresa) return { data: [], count: 0 };
      return treasuryService.listContasCorrentes(queryOptions);
    },
    placeholderData: keepPreviousData,
    enabled: !!activeEmpresa,
  });

  return {
    contas: data?.data ?? [],
    loading: isLoading,
    error: isError ? (queryError as Error).message : null,
    count: data?.count ?? 0,
    page,
    pageSize,
    searchTerm,
    filterAtivo,
    setPage,
    setSearchTerm,
    setFilterAtivo,
    refresh: refetch,
  };
};

export const useMovimentacoes = (contaCorrenteId: string | null) => {
  const { activeEmpresa } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [tipoMov, setTipoMov] = useState<'entrada' | 'saida' | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const queryOptions = {
    contaCorrenteId: contaCorrenteId!,
    startDate,
    endDate,
    tipoMov,
    searchTerm: debouncedSearchTerm,
    page,
    pageSize,
  };

  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: TESOURARIA_KEYS.movimentacoes.list({ ...queryOptions, empresaId: activeEmpresa?.id }),
    queryFn: () => {
      if (!activeEmpresa || !contaCorrenteId) return { data: [], count: 0 };
      return treasuryService.listMovimentacoes(queryOptions);
    },
    placeholderData: keepPreviousData,
    enabled: !!activeEmpresa && !!contaCorrenteId,
  });

  return {
    movimentacoes: data?.data ?? [],
    loading: isLoading,
    error: isError ? (queryError as Error).message : null,
    count: data?.count ?? 0,
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
    refresh: refetch,
  };
};

export const useExtratos = (contaCorrenteId: string | null) => {
  const { activeEmpresa } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [filterConciliado, setFilterConciliado] = useState<boolean | null>(false); // false = apenas pendentes
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const queryOptions = {
    contaCorrenteId: contaCorrenteId!,
    startDate,
    endDate,
    conciliado: filterConciliado,
    searchTerm: debouncedSearchTerm,
    page,
    pageSize,
  };

  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: TESOURARIA_KEYS.extratos.list({ ...queryOptions, empresaId: activeEmpresa?.id }),
    queryFn: () => {
      if (!activeEmpresa || !contaCorrenteId) return { data: [], count: 0 };
      return treasuryService.listExtratos(queryOptions);
    },
    placeholderData: keepPreviousData,
    enabled: !!activeEmpresa && !!contaCorrenteId,
  });

  return {
    extratos: data?.data ?? [],
    loading: isLoading,
    error: isError ? (queryError as Error).message : null,
    count: data?.count ?? 0,
    page,
    pageSize,
    searchTerm,
    startDate,
    endDate,
    filterConciliado,
    setPage,
    setPageSize,
    setSearchTerm,
    setStartDate,
    setEndDate,
    setFilterConciliado,
    refresh: refetch,
  };
};
