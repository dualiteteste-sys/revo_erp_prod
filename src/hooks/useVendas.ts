import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebounce } from './useDebounce';
import * as vendasService from '../services/vendas';
import { useAuth } from '../contexts/AuthProvider';

export const useVendas = () => {
  const { activeEmpresa } = useAuth();
  const [allOrders, setAllOrders] = useState<vendasService.VendaPedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  
  // Paginação Client-Side (já que a RPC retorna tudo por enquanto)
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);

  const fetchOrders = useCallback(async () => {
    if (!activeEmpresa) {
      setAllOrders([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await vendasService.listVendas(debouncedSearchTerm, filterStatus || undefined);
      setAllOrders(data);
      setPage(1); // Reset para primeira página ao filtrar
    } catch (e: any) {
      setError(e.message);
      setAllOrders([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm, filterStatus, activeEmpresa]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Lógica de paginação no cliente
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return allOrders.slice(start, start + pageSize);
  }, [allOrders, page, pageSize]);

  const refresh = () => {
    fetchOrders();
  };

  return {
    orders: paginatedOrders,
    totalCount: allOrders.length,
    loading,
    error,
    searchTerm,
    filterStatus,
    page,
    pageSize,
    setSearchTerm,
    setFilterStatus,
    setPage,
    refresh,
  };
};
