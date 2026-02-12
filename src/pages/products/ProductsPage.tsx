import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProductsTree } from '../../hooks/useProductsTree';
import { useToast } from '../../contexts/ToastProvider';
import ProductsTable from '../../components/products/ProductsTable';
import { ProductMobileCard } from '../../components/products/ProductMobileCard';
import { ResponsiveTable } from '../../components/ui/ResponsiveTable';
import Pagination from '../../components/ui/Pagination';
import DeleteProductModal from '../../components/products/DeleteProductModal';
import { Loader2, Search, Package, DatabaseBackup, Plus, FileDown, FileUp, ExternalLink } from 'lucide-react';
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
import { useAuth } from '@/contexts/AuthProvider';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listWooStores } from '@/services/woocommerceControlPanel';
import { listWooListingsByProducts } from '@/services/woocommerceCatalog';
import WooBulkCatalogWizard, { type WooBulkWizardMode } from '@/components/products/woocommerce/WooBulkCatalogWizard';

const ProductsPage: React.FC = () => {
  const { loading: authLoading, activeEmpresaId, activeEmpresa } = useAuth();
  const navigate = useNavigate();
  const enableSeed = isSeedEnabled();
  const permCreate = useHasPermission('produtos', 'create');
  const permUpdate = useHasPermission('produtos', 'update');
  const permDelete = useHasPermission('produtos', 'delete');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading || permDelete.isLoading;
  const canCreate = !!permCreate.data;
  const canUpdate = !!permUpdate.data;
  const canDelete = !!permDelete.data;

  const {
    rows,
    parents,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    sortBy,
    expandedParentIds,
    toggleParentExpanded,
    highlightedChildIds,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterStatus,
    setSortBy,
  } = useProductsTree();
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
  const [wooStores, setWooStores] = useState<Array<{ id: string; base_url: string; status: string }>>([]);
  const [wooStoreId, setWooStoreId] = useState('');
  const [wooListingByProductId, setWooListingByProductId] = useState<Map<string, any>>(new Map());
  const [wooWizardMode, setWooWizardMode] = useState<WooBulkWizardMode>('export');
  const [wooWizardOpen, setWooWizardOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const handledOpenRef = useRef(false);

  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);
  const effectiveError = empresaChanged ? null : error;
  const effectiveRows = empresaChanged ? [] : rows;
  const effectiveParents = empresaChanged ? [] : parents;
  const effectiveCount = empresaChanged ? 0 : count;

  const bulk = useBulkSelection(effectiveParents, (p) => p.id);
  const selectedProducts = useMemo(
    () => effectiveParents.filter((p) => bulk.selectedIds.has(p.id)),
    [effectiveParents, bulk.selectedIds]
  );
  const parentIds = useMemo(() => effectiveParents.map((row) => row.id), [effectiveParents]);
  const parentIdsKey = useMemo(() => parentIds.join('|'), [parentIds]);

  useEffect(() => {
    if (!activeEmpresaId) return;
    listWooStores(activeEmpresaId)
      .then((stores) => {
        setWooStores(stores as any);
        if (!wooStoreId && stores.length > 0) setWooStoreId(String(stores[0].id));
      })
      .catch(() => {
        setWooStores([]);
        setWooStoreId('');
      });
  }, [activeEmpresaId]);

  useEffect(() => {
    if (!activeEmpresaId || !wooStoreId || parentIds.length === 0) {
      setWooListingByProductId((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    listWooListingsByProducts({
      empresaId: activeEmpresaId,
      storeId: wooStoreId,
      revoProductIds: parentIds,
    })
      .then((rows) => {
        const map = new Map<string, any>();
        for (const row of rows) map.set(String(row.revo_product_id), row);
        setWooListingByProductId(map);
      })
      .catch(() => setWooListingByProductId((prev) => (prev.size === 0 ? prev : new Map())));
  }, [activeEmpresaId, wooStoreId, parentIdsKey]);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;

    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setIsFormOpen(false);
    setSelectedProduct(null);
    setIsDeleteModalOpen(false);
    setProductToDelete(null);
    setIsDeleting(false);
    setIsFetchingDetails(false);
    setIsImportOpen(false);
    setBulkDeleteOpen(false);
    setBulkLoading(false);
    bulk.clear();
    handledOpenRef.current = false;

    const openId = searchParams.get('open');
    if (prevEmpresaId && activeEmpresaId && openId) {
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }

    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId, bulk, searchParams, setSearchParams]);

  const refreshList = useCallback(() => {
    setPage(1);
    setSearchTerm('');
  }, [setPage, setSearchTerm]);

  const handleOpenForm = async (product: { id: string } | null = null) => {
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

  useEffect(() => {
    if (handledOpenRef.current) return;
    if (authLoading || !activeEmpresaId || empresaChanged) return;

    const openId = searchParams.get('open');
    if (!openId) {
      handledOpenRef.current = true;
      return;
    }
    handledOpenRef.current = true;

    if (!permsLoading && !canUpdate) {
      addToast('Você não tem permissão para editar produtos.', 'warning');
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
      return;
    }

    void (async () => {
      setIsFetchingDetails(true);
      setIsFormOpen(true);
      setSelectedProduct(null);
      try {
        const fullProduct = await productsService.getProductDetails(openId);
        if (!fullProduct) {
          addToast('Não é possível editar este produto legado. Por favor, crie um novo.', 'info');
          setIsFormOpen(false);
        } else {
          setSelectedProduct(fullProduct);
        }
      } catch (e: any) {
        addToast(e?.message || 'Erro ao abrir o produto.', 'error');
        setIsFormOpen(false);
      } finally {
        setIsFetchingDetails(false);
        const next = new URLSearchParams(searchParams);
        next.delete('open');
        setSearchParams(next, { replace: true });
      }
    })();
  }, [addToast, authLoading, activeEmpresaId, canUpdate, empresaChanged, permsLoading, searchParams, setSearchParams]);

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedProduct(null);
  };

  const handleSaveSuccess = () => {
    handleCloseForm();
  };

  const handleOpenDeleteModal = (product: { id: string }) => {
    const row = rows.find((r) => r.id === product.id);
    const minimal = row
      ? ({
        id: row.id,
        nome: row.nome,
        sku: row.sku,
        slug: (row as any).slug ?? null,
        status: row.status as any,
        preco_venda: row.preco_venda as any,
        unidade: row.unidade as any,
        created_at: row.created_at as any,
        updated_at: row.updated_at as any,
      } as productsService.Product)
      : null;

    setProductToDelete(minimal ?? null);
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
      await productsService.deleteProductById(productToDelete.id);
      addToast('Produto excluído com sucesso!', 'success');
      handleCloseDeleteModal();
    } catch (e: any) {
      addToast(e.message || 'Erro ao excluir produto.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSort = () => {
    setSortBy((prev) => ({ column: 'nome', ascending: !prev.ascending }));
  };

  const handleClone = async (product: { id: string }) => {
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
      const results = await Promise.allSettled(selectedProducts.map((p) => productsService.deleteProductById(p.id)));
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
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={wooStoreId}
            onChange={(event) => setWooStoreId(event.target.value)}
            className="w-[280px]"
          >
            <option value="">Loja Woo (coluna/status)</option>
            {wooStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.base_url} ({store.status})
              </option>
            ))}
          </Select>

          <Button
            onClick={() => {
              if (!wooStoreId) {
                addToast('Selecione uma loja Woo para importar catálogo.', 'warning');
                return;
              }
              navigate(`/app/products/woocommerce/catalog?store=${encodeURIComponent(wooStoreId)}`);
            }}
            variant="secondary"
            className="gap-2"
            disabled={!wooStoreId || effectiveLoading}
          >
            <ExternalLink size={18} />
            Catálogo Woo
          </Button>

          <Button
            onClick={() => {
              downloadCsv({
                filename: 'produtos.csv',
                headers: ['Nome', 'SKU', 'Status', 'Preço', 'Unidade'],
                rows: effectiveParents.map((p: any) => [
                  p.nome || '',
                  p.sku || '',
                  p.status || p.ativo || '',
                  p.preco_venda ?? p.preco ?? '',
                  p.unidade_sigla || p.unidade || '',
                ]),
              });
            }}
            disabled={effectiveLoading || effectiveParents.length === 0}
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
            title="Importar produtos por CSV/XLSX"
            disabled={effectiveLoading}
          >
            <FileUp size={18} />
            Importar CSV/XLSX
          </Button>

          {enableSeed ? (
            <Button onClick={handleSeedProducts} disabled={isSeeding || effectiveLoading} variant="secondary" className="gap-2">
              {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
              Popular dados
            </Button>
          ) : null}

          <Button
            onClick={() => handleOpenForm()}
            className="gap-2"
            disabled={effectiveLoading || permsLoading || !canCreate}
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
    <div className="flex flex-wrap gap-3 sm:gap-4">
      <div className="relative w-full sm:w-auto sm:flex-grow sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nome ou SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-3 pl-10 border border-gray-300 rounded-lg"
        />
      </div>
      <Select
        value={filterStatus || ''}
        onChange={(e) => setFilterStatus((e.target.value as 'ativo' | 'inativo') || null)}
        className="w-full sm:w-auto sm:min-w-[200px]"
      >
        <option value="">Todos os status</option>
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </Select>
    </div>
  );

  if (authLoading) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  if (!activeEmpresaId) {
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver produtos.</div>;
  }

  const footer = effectiveCount > 0 ? (
    <Pagination
      currentPage={page}
      totalCount={effectiveCount}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(next) => {
        setPage(1);
        setPageSize(next);
      }}
    />
  ) : null;

  return (
    <PageShell header={header} filters={filters} footer={footer}>
      <PageCard className="flex flex-col flex-1 min-h-0">
        {effectiveLoading && effectiveParents.length === 0 ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : effectiveError ? (
          <div className="h-96 flex items-center justify-center text-red-500">{effectiveError}</div>
        ) : effectiveParents.length === 0 ? (
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
                {
                  key: 'woo-export',
                  label: 'Woo: Exportar',
                  onClick: () => {
                    if (!wooStoreId) {
                      addToast('Selecione uma loja Woo antes da ação em massa.', 'warning');
                      return;
                    }
                    setWooWizardMode('export');
                    setWooWizardOpen(true);
                  },
                  disabled: !wooStoreId,
                },
                {
                  key: 'woo-price',
                  label: 'Woo: Sincronizar preço',
                  onClick: () => {
                    if (!wooStoreId) {
                      addToast('Selecione uma loja Woo antes da ação em massa.', 'warning');
                      return;
                    }
                    setWooWizardMode('sync_price');
                    setWooWizardOpen(true);
                  },
                  disabled: !wooStoreId,
                },
                {
                  key: 'woo-stock',
                  label: 'Woo: Sincronizar estoque',
                  onClick: () => {
                    if (!wooStoreId) {
                      addToast('Selecione uma loja Woo antes da ação em massa.', 'warning');
                      return;
                    }
                    setWooWizardMode('sync_stock');
                    setWooWizardOpen(true);
                  },
                  disabled: !wooStoreId,
                },
              ]}
            />
            <div className="flex-1 min-h-0 overflow-auto">
              <ResponsiveTable
                data={effectiveParents}
                getItemId={(p) => p.id}
                loading={effectiveLoading}
                tableComponent={
                  <ProductsTable
                    rows={effectiveRows}
                    onEdit={(p) => handleOpenForm(p)}
                    onDelete={(p) => handleOpenDeleteModal(p)}
                    onClone={(p) => handleClone(p)}
                    sortBy={{ column: 'nome', ascending: sortBy.ascending }}
                    onSort={() => handleSort()}
                    expandedParentIds={expandedParentIds}
                    onToggleExpand={toggleParentExpanded}
                    highlightedChildIds={highlightedChildIds}
                    selectedIds={bulk.selectedIds}
                    allSelected={bulk.allSelected}
                    someSelected={bulk.someSelected}
                    onToggleSelect={(id) => bulk.toggle(id)}
                    onToggleSelectAll={() => bulk.toggleAll(bulk.allIds)}
                    wooListingByProductId={wooListingByProductId}
                  />
                }
                renderMobileCard={(product) => (
                  <ProductMobileCard
                    key={product.id}
                    product={product as any}
                    onEdit={() => handleOpenForm(product)}
                    onDelete={() => handleOpenDeleteModal(product)}
                    onClone={() => handleClone(product)}
                    selected={bulk.selectedIds.has(product.id)}
                    onToggleSelect={(id) => bulk.toggle(id)}
                  />
                )}
              />
            </div>
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
            saveProduct={async (payload) => {
              if (!activeEmpresa?.id) throw new Error('Nenhuma empresa ativa selecionada.');
              return productsService.saveProduct(payload, activeEmpresa.id);
            }}
          />
        )}
      </Modal>

      <ImportProductsCsvModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        importFn={async (payload) => {
          if (!activeEmpresa?.id) throw new Error('Nenhuma empresa ativa selecionada.');
          return productsService.saveProduct(payload, activeEmpresa.id);
        }}
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

      <WooBulkCatalogWizard
        isOpen={wooWizardOpen}
        onClose={() => setWooWizardOpen(false)}
        empresaId={activeEmpresaId || ''}
        storeId={wooStoreId}
        selectedRevoProductIds={selectedProducts.map((product) => product.id)}
        initialMode={wooWizardMode}
        onRunCreated={(runId) => {
          setWooWizardOpen(false);
          navigate(`/app/products/woocommerce/runs/${runId}?store=${encodeURIComponent(wooStoreId)}`);
        }}
      />
    </PageShell>
  );
};

export default ProductsPage;
