import { useState } from 'react';
import { useDebounce } from './useDebounce';
import * as partnersService from '../services/partners';
import { useAuth } from '../contexts/AuthProvider';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

export const PARTNERS_KEYS = {
  all: ['partners'] as const,
  list: (filters: any) => [...PARTNERS_KEYS.all, 'list', filters] as const,
  detail: (id: string) => [...PARTNERS_KEYS.all, 'detail', id] as const,
};

export const usePartners = () => {
  const { activeEmpresa } = useAuth();

  // Local state for filters
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<partnersService.PartnerStatusFilter>('active');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<{ column: keyof partnersService.PartnerListItem; ascending: boolean }>({
    column: 'nome',
    ascending: true,
  });

  // Query options
  const queryOptions = {
    page,
    pageSize,
    searchTerm: debouncedSearchTerm,
    filterType,
    statusFilter,
    sortBy,
  };

  // Fetch partners using TanStack Query
  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: PARTNERS_KEYS.list({ ...queryOptions, empresaId: activeEmpresa?.id }),
    queryFn: () => {
      if (!activeEmpresa) return { data: [], count: 0 };
      return partnersService.getPartners(queryOptions);
    },
    placeholderData: keepPreviousData,
    enabled: !!activeEmpresa,
  });

  return {
    partners: data?.data ?? [],
    loading: isLoading,
    error: isError ? (queryError as Error).message : null,
    count: data?.count ?? 0,
    page,
    pageSize,
    searchTerm,
    filterType,
    statusFilter,
    sortBy,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterType,
    setStatusFilter,
    setSortBy,
    refresh: refetch,
  };
};
