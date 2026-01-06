import React, { useCallback, useMemo, useState } from 'react';
import { useProducts } from '../../hooks/useProducts';
import { useToast } from '../../contexts/ToastProvider';
import ProductsTable from '../../components/products/ProductsTable';
import Pagination from '../../components/ui/Pagination';
import DeleteProductModal from '../../components/products/DeleteProductModal';
import { Loader2, Search, Package, DatabaseBackup, Plus, FileDown, FileUp } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ProductFormPanel from '../../components/products/ProductFormPanel';
import * as productsService from '../../services/products';
import Select from '@/components/ui/forms/Select';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { downloadCsv } from '@/utils/csv';
import { isSeedEnabled } from '@/utils/seed';
import { useHasPermission } from '@/hooks/useHasPermission';
import ImportProductsCsvModal from '@/components/products/ImportProductsCsvModal';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionsBar from '@/components/ui/BulkActionsBar';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import EmptyState from '@/components/ui/EmptyState';
import { uiMessages } from '@/lib/ui/messages';
import PageHelp from '@/components/support/PageHelp';

const ProductsPage: React.FC = () => {
  const enableSeed = isSeedEnabled();
  const permCreate = useHasPermission('produtos', 'create');
  const permUpdate = useHasPermission('produtos', 'update');
  const permDelete = useHasPermission('produtos', 'delete');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading || permDelete.isLoading;
  const canCreate = !!permCreate.data;
  const canUpdate = !!permUpdate.data;
  const canDelete = !!permDelete.data;

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
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const bulk = useBulkSelection(products, (p) => p.id);
  const selectedProducts = useMemo(
    () => products.filter((p) => bulk.selectedIds.has(p.id)),
    [products, bulk.selectedIds]
  );

  const refreshList = useCallback(() => {
    setPage(1);
    setSearchTerm('');
  }, [setPage, setSearchTerm]);

  const handleOpenForm = async (product: productsService.Product | null = null) => {
    const needsUpdate = !!product?.id;
    if (!permsLoading && needsUpdate && !canUpdate) {
      addToast('Você não tem permissão para editar produtos.', 'warning');
      return;
    }
    if (!permsLoading && !needsUpdate && !canCreate) {
      addToast('Você não tem permissão para criar produtos.', 'warning');
      return;
    }
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
    if (!permsLoading && !canDelete) {
      addToast('Você não tem permissão para excluir produtos.', 'warning');
      return;
    }
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
    if (!permsLoading && !canCreate) {
      addToast('Você não tem permissão para clonar produtos.', 'warning');
      return;
    }
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

  const confirmBulkDelete = async () => {
    if (!selectedProducts.length) return;
    if (!permsLoading && !canDelete) {
      addToast('Você não tem permissão para excluir produtos.', 'warning');
      return;
    }
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(selectedProducts.map((p) => deleteProduct(p.id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (ok) addToast(`${ok} produto(s) excluído(s).`, 'success');
      if (fail) addToast(`${fail} falha(s) ao excluir.`, 'warning');
      bulk.clear();
      setBulkDeleteOpen(false);
      refreshList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir selecionados.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };


  const header = (
    <PageHeader
      title="Produtos"
      description="Catálogo de produtos e configurações fiscais básicas."
      icon={<Package size={20} />}
      actions={
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              downloadCsv({
                filename: 'produtos.csv',
                headers: ['Nome', 'SKU', 'Status', 'Preço', 'Unidade'],
                rows: products.map((p: any) => [
                  p.nome || '',
                  p.sku || '',
                  p.status || p.ativo || '',
                  p.preco_venda ?? p.preco ?? '',
                  p.unidade_sigla || p.unidade || '',
                ]),
              });
            }}
            disabled={loading || products.length === 0}
            variant="secondary"
            className="gap-2"
            title="Exportar a lista atual"
          >
            <FileDown size={18} />
            Exportar CSV
          </Button>

          <Button
            onClick={() => setIsImportOpen(true)}
            variant="secondary"
            className="gap-2"
            title="Importar produtos por CSV"
          >
            <FileUp size={18} />
            Importar CSV
          </Button>

          {enableSeed ? (
            <Button onClick={handleSeedProducts} disabled={isSeeding || loading} variant="secondary" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
              Popular dados
            </Button>
          ) : null}

          <Button
            onClick={() => handleOpenForm()}
            className="gap-2"
            disabled={permsLoading || !canCreate}
            title={!canCreate ? 'Sem permissão para criar' : undefined}
          >
            <Plus size={18} />
            Novo produto
          </Button>
        </div>
      }
    />
  );

  const filters = (
    <div className="flex gap-4">
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
        onChange={(e) => setFilterStatus((e.target.value as 'ativo' | 'inativo') || null)}
        className="min-w-[200px]"
      >
        <option value="">Todos os status</option>
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </Select>
    </div>
  );

  const footer = count > pageSize ? (
    <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
  ) : null;

  return (
    <PageShell header={header} filters={filters} footer={footer}>
      <PageHelp
        title="Produtos: guia rápido"
        whatIs="Produtos conectam estoque, compras, vendas e fiscal. O objetivo é cadastrar com unidade, SKU e regras mínimas para evitar divergência de saldo e erro em pedidos."
        steps={[
          'Clique em “Adicionar” e preencha nome + unidade + (opcional) SKU/código.',
          'Se já tiver base, use “Importar CSV” para acelerar e padronizar.',
          'Valide no fluxo: movimente estoque e crie um pedido usando o produto.',
        ]}
        links={[
          { label: 'Abrir Estoque', href: '/app/suprimentos/estoque', kind: 'internal' },
          { label: 'Abrir Pedidos', href: '/app/vendas/pedidos', kind: 'internal' },
        ]}
      />
      <PageCard>
        {loading && products.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package size={48} />}
            title="Nenhum produto encontrado"
            description={`Comece cadastrando um novo produto${enableSeed ? ' ou popule com dados de exemplo.' : '.'}`}
            hint={searchTerm ? uiMessages.empty.tryAdjustFilters : undefined}
            actions={
              enableSeed ? (
                <Button onClick={handleSeedProducts} disabled={isSeeding} variant="secondary" className="gap-2">
                  {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
                  Popular com dados de exemplo
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <BulkActionsBar
              selectedCount={bulk.selectedCount}
              onClear={bulk.clear}
              actions={[
                {
                  key: 'delete',
                  label: 'Excluir',
                  onClick: () => setBulkDeleteOpen(true),
                  variant: 'destructive',
                  disabled: bulkLoading || permsLoading || !canDelete,
                },
              ]}
            />
            <ProductsTable
              products={products}
              onEdit={(p) => handleOpenForm(p)}
              onDelete={handleOpenDeleteModal}
              onClone={handleClone}
              sortBy={sortBy}
              onSort={handleSort}
              selectedIds={bulk.selectedIds}
              allSelected={bulk.allSelected}
              someSelected={bulk.someSelected}
              onToggleSelect={(id) => bulk.toggle(id)}
              onToggleSelectAll={() => bulk.toggleAll(bulk.allIds)}
            />
          </>
        )}
      </PageCard>

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

      <ImportProductsCsvModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        importFn={saveProduct}
        deleteFn={(id) => productsService.deleteProductById(id)}
        onImported={() => {
          setIsImportOpen(false);
          refreshList();
        }}
      />

      <DeleteProductModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDelete}
        product={productToDelete as any}
        isDeleting={isDeleting}
      />

      <ConfirmationModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
        title="Confirmar Exclusão em Massa"
        description={`Tem certeza que deseja excluir ${selectedProducts.length} produto(s)? Esta ação não pode ser desfeita.`}
        confirmText="Sim, Excluir"
        isLoading={bulkLoading}
        variant="danger"
      />
    </PageShell>
  );
};

export default ProductsPage;
