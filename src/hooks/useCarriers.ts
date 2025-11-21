import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as carriersService from '../services/carriers';
import { useAuth } from '../contexts/AuthProvider';

export const useCarriers = () => {
  const { activeEmpresa } = useAuth();
  const [carriers, setCarriers] = useState<carriersService.CarrierListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);

  const [sortBy, setSortBy] = useState<{ column: keyof carriersService.CarrierListItem; ascending: boolean }>({
    column: 'nome_razao_social',
    ascending: true,
  });

  const fetchCarriers = useCallback(async () => {
    if (!activeEmpresa) {
        setCarriers([]);
        setCount(0);
        return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, count } = await carriersService.getCarriers({
        page,
        pageSize,
        searchTerm: debouncedSearchTerm,
        filterStatus,
        sortBy,
      });
      setCarriers(data);
      setCount(count);
    } catch (e: any) {
      setError(e.message);
      setCarriers([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearchTerm, filterStatus, sortBy, activeEmpresa]);

  useEffect(() => {
    fetchCarriers();
  }, [fetchCarriers]);

  const refresh = () => {
    fetchCarriers();
  };

  return {
    carriers,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    sortBy,
    setPage,
    setSearchTerm,
    setFilterStatus,
    setSortBy,
    refresh,
  };
};
