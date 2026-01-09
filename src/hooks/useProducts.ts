import { useState } from 'react';
import { useAuth } from '../contexts/AuthProvider';
import { useDebounce } from './useDebounce';
import { Product, getProducts, saveProduct, deleteProductById, FullProduct } from '../services/products';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';

export const PRODUCTS_KEYS = {
  all: ['products'] as const,
  list: (filters: any) => [...PRODUCTS_KEYS.all, 'list', filters] as const,
  detail: (id: string) => [...PRODUCTS_KEYS.all, 'detail', id] as const,
};

export const useProducts = () => {
  const { activeEmpresa } = useAuth();
  const queryClient = useQueryClient();

  // Local state for filters
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [filterStatus, setFilterStatus] = useState<'ativo' | 'inativo' | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<{ column: keyof Product; ascending: boolean }>({
    column: 'nome',
    ascending: true,
  });

  // Query options
  const queryOptions = {
    page,
    pageSize,
    searchTerm: debouncedSearchTerm,
    status: filterStatus,
    sortBy,
  };

  // Fetch products using TanStack Query
  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: PRODUCTS_KEYS.list({ ...queryOptions, empresaId: activeEmpresa?.id }),
    queryFn: () => getProducts(queryOptions),
    placeholderData: keepPreviousData,
    enabled: !!activeEmpresa,
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (formData: Partial<FullProduct>) => {
      if (!activeEmpresa) throw new Error('Nenhuma empresa ativa selecionada.');
      return saveProduct(formData, activeEmpresa.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEYS.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProductById,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEYS.all });
    },
  });

  return {
    products: data?.data ?? [],
    loading: isLoading,
    error: isError ? (queryError as Error).message : null,
    count: data?.count ?? 0,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    sortBy,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterStatus,
    setSortBy,
    saveProduct: saveMutation.mutateAsync,
    deleteProduct: deleteMutation.mutateAsync,
  };
};

export default useProducts;
