import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as partnersService from '../services/partners';
import { useAuth } from '../contexts/AuthProvider';

export const usePartners = () => {
  const { activeEmpresa } = useAuth();
  const [partners, setPartners] = useState<partnersService.PartnerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const [filterType, setFilterType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);

  const [sortBy, setSortBy] = useState<{ column: keyof partnersService.PartnerListItem; ascending: boolean }>({
    column: 'nome',
    ascending: true,
  });

  const fetchPartners = useCallback(async () => {
    if (!activeEmpresa) {
        setPartners([]);
        setCount(0);
        return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, count } = await partnersService.getPartners({
        page,
        pageSize,
        searchTerm: debouncedSearchTerm,
        filterType,
        sortBy,
      });
      setPartners(data);
      setCount(count);
    } catch (e: any) {
      setError(e.message);
      setPartners([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearchTerm, filterType, sortBy, activeEmpresa]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const refresh = () => {
    fetchPartners();
  };

  return {
    partners,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterType,
    sortBy,
    setPage,
    setSearchTerm,
    setFilterType,
    setSortBy,
    refresh,
  };
};
