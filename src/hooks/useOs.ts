import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from './useDebounce';
import * as osService from '../services/os';
import { useAuth } from '../contexts/AuthProvider';

export const useOs = () => {
  const { activeEmpresaId, activeEmpresa, userId } = useAuth();
  const empresaId = activeEmpresaId ?? activeEmpresa?.id ?? null;
  const [serviceOrders, setServiceOrders] = useState<osService.OrdemServico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const [filterStatus, setFilterStatus] = useState<osService.status_os | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [onlyMine, setOnlyMine] = useState(false);

  const [sortBy, setSortBy] = useState<{ column: keyof osService.OrdemServico; ascending: boolean }>({
    column: 'ordem',
    ascending: true,
  });

  const lastEmpresaIdRef = useRef<string | null>(empresaId);
  const empresaChanged = lastEmpresaIdRef.current !== empresaId;

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === empresaId) return;

    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setServiceOrders([]);
    setCount(0);
    setError(null);
    setPage(1);
    setSortBy({ column: 'ordem', ascending: true });
    setLoading(!!empresaId);

    lastEmpresaIdRef.current = empresaId;
  }, [empresaId]);

  const fetchOs = useCallback(async () => {
    if (!empresaId || empresaChanged) {
	        setServiceOrders([]);
	        setCount(0);
	        return;
	    }
    setLoading(true);
    setError(null);
    try {
      const data = await osService.listOs({
        offset: (page - 1) * pageSize,
        limit: pageSize,
        search: debouncedSearchTerm,
        status: filterStatus ? [filterStatus] : null,
        orderBy: sortBy.column as string,
        orderDir: sortBy.ascending ? 'asc' : 'desc',
        onlyMine,
        tecnicoUserId: onlyMine ? userId : null,
      });
      setServiceOrders(data);
      const newCount = data.length < pageSize ? (page - 1) * pageSize + data.length : (page * pageSize) + 1;
      setCount(newCount);
    } catch (e: any) {
      setError(e.message);
      setServiceOrders([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearchTerm, filterStatus, sortBy, empresaChanged, empresaId, onlyMine, userId]);

  useEffect(() => {
    fetchOs();
  }, [fetchOs]);

  const reorderOs = useCallback(async (startIndex: number, endIndex: number) => {
    const items = Array.from(serviceOrders);
    const [reorderedItem] = items.splice(startIndex, 1);
    items.splice(endIndex, 0, reorderedItem);

    setServiceOrders(items);
    setSortBy({ column: 'ordem', ascending: true });

    const newOrderIds = items.map(item => item.id);
    try {
        await osService.updateOsOrder(newOrderIds);
    } catch (error) {
        fetchOs(); // Revert on error
        throw error; // Re-throw for the page to display a toast
    }
  }, [serviceOrders, fetchOs]);

  const refresh = () => {
    fetchOs();
  };

  return {
    serviceOrders,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    sortBy,
    onlyMine,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterStatus,
    setSortBy,
    setOnlyMine: (value: boolean) => {
      setOnlyMine(value);
      setPage(1);
    },
    refresh,
    reorderOs,
  };
};
