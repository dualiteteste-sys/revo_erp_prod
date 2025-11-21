import React, { useState, useCallback } from 'react';
import { useProducts } from '../../hooks/useProducts';
import { useToast } from '../../contexts/ToastProvider';
import ProductsTable from '../../components/products/ProductsTable';
import Pagination from '../../components/ui/Pagination';
import DeleteProductModal from '../../components/products/DeleteProductModal';
import { Loader2, PlusCircle, Search, Package, DatabaseBackup } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ProductFormPanel from '../../components/products/ProductFormPanel';
import * as productsService from '../../services/products';
import Select from '@/components/ui/forms/Select';

const ProductsPage: React.FC = () => {
  const {
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
    saveProduct,
    deleteProduct,
  } = useProducts();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<productsService.FullProduct | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<productsService.Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const refreshList = useCallback(() => {
    setPage(1);
    setSearchTerm('');
  }, [setPage, setSearchTerm]);

  const handleOpenForm = async (product: productsService.Product | null = null) => {
    if (product && product.id) {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedProduct(null);

      const fullProduct = await productsService.getProductDetails(product.id);
      
      setIsFetchingDetails(false);

      if (!fullProduct) {
        addToast('Não é possível editar este produto legado. Por favor, crie um novo.', 'info');
        setIsFormOpen(false);
      } else {
        setSelectedProduct(fullProduct);
      }
    } else {
      setSelectedProduct(null);
      setIsFormOpen(true);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedProduct(null);
  };

  const handleSaveSuccess = () => {
    handleCloseForm();
  };

  const handleOpenDeleteModal = (product: productsService.Product) => {
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setProductToDelete(null);
  };

  const handleDelete = async () => {
    if (!productToDelete || !productToDelete.id) return;
    setIsDeleting(true);
    try {
      await deleteProduct(productToDelete.id);
      addToast('Produto excluído com sucesso!', 'success');
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir produto.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSort = (column: keyof productsService.Product) => {
    setSortBy(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }));
  };

  const handleClone = async (product: productsService.Product) => {
    if (!product.id) return;
    try {
      const clone = await productsService.cloneProduct(product.id);
      addToast('Produto clonado com sucesso!', 'success');
      setSelectedProduct(clone);
      setIsFormOpen(true);
    } catch (e: any) {
      addToast(e.message || 'Erro ao clonar produto.', 'error');
    }
  };

  const handleSeedProducts = async () => {
    setIsSeeding(true);
    try {
      const seededProducts = await productsService.seedDefaultProducts();
      addToast(`${seededProducts.length} produtos padrão foram adicionados!`, 'success');
      refreshList();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular produtos.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };


  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Produtos</h1>
        <div className="flex items-center gap-2">
            <button
              onClick={handleSeedProducts}
              disabled={isSeeding || loading}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
              Popular Dados
            </button>
            <button
              onClick={() => handleOpenForm()}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle size={20} />
              Novo Produto
            </button>
        </div>
      </div>

      <div className="mb-4 flex gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-sm p-3 pl-10 border border-gray-300 rounded-lg"
          />
        </div>
        <Select
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value as 'ativo' | 'inativo' || null)}
          className="min-w-[200px]"
        >
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && products.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : products.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-center text-gray-500 p-4">
            <Package size={48} className="mb-4" />
            <p className="font-semibold text-lg">Nenhum produto encontrado.</p>
            <p className="text-sm mb-4">Comece cadastrando um novo produto ou popule com dados de exemplo.</p>
            {searchTerm && <p className="text-sm">Tente ajustar sua busca.</p>}
            <button
              onClick={handleSeedProducts}
              disabled={isSeeding}
              className="mt-4 flex items-center gap-2 bg-blue-100 text-blue-700 font-bold py-2 px-4 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
              Popular com 10 produtos padrão
            </button>
          </div>
        ) : (
          <ProductsTable products={products} onEdit={(p) => handleOpenForm(p)} onDelete={handleOpenDeleteModal} onClone={handleClone} sortBy={sortBy} onSort={handleSort} />
        )}
      </div>

      {count > pageSize && (
        <Pagination
          currentPage={page}
          totalCount={count}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        title={selectedProduct ? 'Editar Produto' : 'Novo Produto'}
      >
        {isFetchingDetails ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : (
          <ProductFormPanel 
              product={selectedProduct}
              onSaveSuccess={handleSaveSuccess}
              onClose={handleCloseForm}
              saveProduct={saveProduct}
          />
        )}
      </Modal>

      <DeleteProductModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        product={productToDelete as any}
        isDeleting={isDeleting}
      />
    </div>
  );
};

export default ProductsPage;
