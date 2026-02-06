import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from './useDebounce';
import * as servicesService from '../services/services';
import { useAuth } from '../contexts/AuthProvider';

export const useServices = () => {
  const { activeEmpresaId, activeEmpresa } = useAuth();
  const empresaId = activeEmpresaId ?? activeEmpresa?.id ?? null;
  const [services, setServices] = useState<servicesService.Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'inativo' | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [sortBy, setSortBy] = useState<{ column: keyof servicesService.Service; ascending: boolean }>({
    column: 'descricao',
    ascending: true,
  });

  const lastEmpresaIdRef = useRef<string | null>(empresaId);
  const empresaChanged = lastEmpresaIdRef.current !== empresaId;

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === empresaId) return;

    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setServices([]);
    setCount(0);
    setError(null);
    setPage(1);
    setLoading(!!empresaId);

    lastEmpresaIdRef.current = empresaId;
  }, [empresaId]);

  const fetchServices = useCallback(async () => {
    if (!empresaId || empresaChanged) {
	        setServices([]);
	        setCount(0);
	        return;
	    }
    setLoading(true);
    setError(null);
    try {
      const total = await servicesService.countServices({ search: debouncedSearchTerm, status: statusFilter });
      const data = await servicesService.listServices({
        offset: (page - 1) * pageSize,
        limit: pageSize,
        search: debouncedSearchTerm,
        status: statusFilter,
        orderBy: sortBy.column,
        orderDir: sortBy.ascending ? 'asc' : 'desc',
      });
      setServices(data);
      // Se a contagem não estiver disponível, volta para estimativa.
      if (total >= 0) {
        setCount(total);
      } else {
        const newCount = data.length < pageSize ? (page - 1) * pageSize + data.length : (page * pageSize) + 1;
        setCount(newCount);
      }
    } catch (e: any) {
      setError(e.message);
      setServices([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearchTerm, sortBy, empresaChanged, empresaId, statusFilter]);

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
    statusFilter,
    sortBy,
    setPage,
    setPageSize,
    setSearchTerm,
    setStatusFilter,
    setSortBy,
    refresh,
  };
};
