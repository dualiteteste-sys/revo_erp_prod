import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as vendasService from '../services/vendas';
import { useAuth } from '../contexts/AuthProvider';

export const useVendas = () => {
  const { activeEmpresa } = useAuth();
  const [orders, setOrders] = useState<vendasService.VendaPedido[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, filterStatus]);

  const fetchOrders = useCallback(async () => {
    if (!activeEmpresa) {
      setOrders([]);
      setTotalCount(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const limit = pageSize;
      const offset = (page - 1) * pageSize;
      const data = await vendasService.listVendas({
        search: debouncedSearchTerm || undefined,
        status: filterStatus || undefined,
        limit,
        offset,
      });

      setOrders(data);
      const count = Number((data?.[0] as any)?.total_count ?? 0);
      setTotalCount(Number.isFinite(count) ? count : 0);
    } catch (e: any) {
      setError(e.message);
      setOrders([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresa, debouncedSearchTerm, filterStatus, page, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const refresh = () => {
    fetchOrders();
  };

  return {
    orders,
    totalCount,
    loading,
    error,
    searchTerm,
    filterStatus,
    page,
    pageSize,
    setSearchTerm,
    setFilterStatus,
    setPage,
    setPageSize,
    refresh,
  };
};
