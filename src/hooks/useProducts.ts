import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthProvider';
import { useDebounce } from './useDebounce';
import { Product, getProducts, saveProduct, deleteProductById, FullProduct } from '../services/products';

export const useProducts = () => {
  const { activeEmpresa } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const [filterStatus, setFilterStatus] = useState<'ativo' | 'inativo' | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [sortBy, setSortBy] = useState<{ column: keyof Product; ascending: boolean }>({
    column: 'nome',
    ascending: true,
  });

  const fetchProducts = useCallback(async () => {
    if (!activeEmpresa) {
      setProducts([]);
      setCount(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, count } = await getProducts({
        page,
        pageSize,
        searchTerm: debouncedSearchTerm,
        status: filterStatus,
        sortBy,
      });
      setProducts(data);
      setCount(count);
    } catch (e: any) {
      setError(e.message);
      setProducts([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresa, page, pageSize, debouncedSearchTerm, filterStatus, sortBy]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const saveProductCallback = useCallback(async (formData: Partial<FullProduct>) => {
    if (!activeEmpresa) {
      throw new Error('Nenhuma empresa ativa selecionada.');
    }
    const savedProduct = await saveProduct(formData, activeEmpresa.id);
    await fetchProducts(); // Refresh list after saving
    return savedProduct;
  }, [activeEmpresa, fetchProducts]);

  const deleteProductCallback = useCallback(
    async (id: string) => {
      await deleteProductById(id);
      await fetchProducts(); // Refresh list after deleting
    },
    [fetchProducts]
  );

  return {
    products,
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
    saveProduct: saveProductCallback,
    deleteProduct: deleteProductCallback,
  };
};

export default useProducts;
