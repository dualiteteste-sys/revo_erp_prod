import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as servicesService from '../services/services';
import { useAuth } from '../contexts/AuthProvider';

export const useServices = () => {
  const { activeEmpresa } = useAuth();
  const [services, setServices] = useState<servicesService.Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);

  const [sortBy, setSortBy] = useState<{ column: keyof servicesService.Service; ascending: boolean }>({
    column: 'descricao',
    ascending: true,
  });

  const fetchServices = useCallback(async () => {
    if (!activeEmpresa) {
        setServices([]);
        setCount(0);
        return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await servicesService.listServices({
        offset: (page - 1) * pageSize,
        limit: pageSize,
        search: debouncedSearchTerm,
        orderBy: sortBy.column,
        orderDir: sortBy.ascending ? 'asc' : 'desc',
      });
      setServices(data);
      // A RPC de listagem não retorna contagem, então fazemos uma estimativa
      const newCount = data.length < pageSize ? (page - 1) * pageSize + data.length : (page * pageSize) + 1;
      setCount(newCount);
    } catch (e: any) {
      setError(e.message);
      setServices([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearchTerm, sortBy, activeEmpresa]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const refresh = () => {
    fetchServices();
  };

  return {
    services,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    sortBy,
    setPage,
    setSearchTerm,
    setSortBy,
    refresh,
  };
};
