import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import Pagination from '@/components/ui/Pagination';
import ListPaginationBar from '@/components/ui/ListPaginationBar';
import { Button } from '@/components/ui/button';
import {
  previewWooImport,
  runWooImport,
  runWooWorkerNow,
  searchWooCatalogProducts,
  type WooCatalogPreviewResponse,
  type WooSearchRow,
} from '@/services/woocommerceCatalog';
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  ImageOff,
  Loader2,
  Package,
  Search,
  X,
} from 'lucide-react';

type StatusFilter = 'all' | 'new' | 'imported';

const PER_PAGE = 50;

export default function WooCatalogImportPage() {
  const { activeEmpresaId } = useAuth();
  const [searchParams] = useSearchParams();
  const storeId = String(searchParams.get('store') ?? '').trim();
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Search & pagination state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Data state
  const [rows, setRows] = useState<WooSearchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Import modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<WooCatalogPreviewResponse | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importingIds, setImportingIds] = useState<number[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    if (!activeEmpresaId || !storeId) return;
    setLoading(true);
    try {
      const response = await searchWooCatalogProducts({
        empresaId: activeEmpresaId,
        storeId,
        query: debouncedQuery,
        page,
        perPage: PER_PAGE,
      });
      setRows(response.rows ?? []);
      setTotal(response.total ?? 0);
      setTotalPages(response.totalPages ?? 0);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao consultar catálogo WooCommerce.', 'error');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [activeEmpresaId, storeId, debouncedQuery, page, addToast]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Filter rows by status (client-side since API doesn't support this filter)
  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows;
    return rows.filter((r) => r.import_status === statusFilter);
  }, [rows, statusFilter]);

  // Selection helpers
  const allSelectableIds = useMemo(
    () => filteredRows.filter((r) => r.import_status === 'new').map((r) => r.id),
    [filteredRows],
  );

  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allSelectableIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allSelectableIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  // Import flow
  const startImport = async (wooIds: number[]) => {
    if (!activeEmpresaId || !storeId || wooIds.length === 0) return;
    setImportingIds(wooIds);
    setImportLoading(true);
    setImportModalOpen(true);
    setImportPreview(null);
    try {
      const response = await previewWooImport({
        empresaId: activeEmpresaId,
        storeId,
        wooProductIds: wooIds,
      });
      setImportPreview(response);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao gerar preview de importação.', 'error');
      setImportModalOpen(false);
    } finally {
      setImportLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!activeEmpresaId || !storeId || importingIds.length === 0) return;
    setImportLoading(true);
    try {
      const response = await runWooImport({
        empresaId: activeEmpresaId,
        storeId,
        wooProductIds: importingIds,
      });
      const created = response.summary?.create ?? 0;
      const updated = response.summary?.update ?? 0;
      addToast(
        `Importação iniciada: ${created} novo(s), ${updated} atualização(ões).`,
        'success',
      );
      setImportModalOpen(false);
      setSelectedIds(new Set());

      try { await runWooWorkerNow({ empresaId: activeEmpresaId, storeId }); } catch { /* best-effort */ }

      // Refresh list after a brief delay for worker to process
      setTimeout(() => fetchProducts(), 2000);
    } catch (error: any) {
      addToast(error?.message || 'Falha ao iniciar importação.', 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const selectedCount = selectedIds.size;
  const hasBlockers = (importPreview?.summary?.block ?? 0) > 0;

  return (
    <PageShell
      header={(
        <PageHeader
          title="Catálogo WooCommerce"
          description="Visualize os produtos da sua loja WooCommerce e importe para o ERP."
          actions={(
            <Button variant="secondary" onClick={() => navigate(-1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          )}
        />
      )}
    >
      <PageCard className="space-y-0 p-0">
        {/* Toolbar: search + filters + bulk action */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou SKU..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50/50 py-2 pl-10 pr-3 text-sm placeholder:text-gray-400 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50/50 p-0.5">
            {([
              { value: 'all' as const, label: 'Todos' },
              { value: 'new' as const, label: 'Novos' },
              { value: 'imported' as const, label: 'Importados' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {selectedCount > 0 && (
            <Button
              onClick={() => startImport(Array.from(selectedIds))}
              className="gap-2"
              disabled={importLoading}
            >
              <Download className="h-4 w-4" />
              Importar {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={allSelectableIds.length === 0}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    title="Selecionar todos os novos"
                  />
                </th>
                <th className="w-12 px-2 py-3" />
                <th className="px-4 py-3 text-left font-medium text-gray-600">Produto</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">SKU</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Preco</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estoque</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Acao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && initialLoad ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" />
                    <div className="mt-2 text-sm text-gray-500">Carregando catálogo...</div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Package className="mx-auto h-8 w-8 text-gray-300" />
                    <div className="mt-2 text-sm text-gray-500">
                      {rows.length > 0 && statusFilter !== 'all'
                        ? 'Nenhum produto com este filtro.'
                        : 'Nenhum produto encontrado.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <ProductRow
                    key={row.id}
                    row={row}
                    selected={selectedIds.has(row.id)}
                    onToggle={() => toggleSelect(row.id)}
                    onImport={() => startImport([row.id])}
                    onView={() => {
                      if (row.revo_product_id) navigate(`/app/products/${row.revo_product_id}`);
                    }}
                    importing={importLoading && importingIds.includes(row.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Loading overlay for non-initial loads */}
        {loading && !initialLoad && (
          <div className="flex items-center justify-center border-t border-gray-100 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500">Atualizando...</span>
          </div>
        )}

        {/* Pagination */}
        {(total > PER_PAGE || totalPages > 1) && (
          <ListPaginationBar>
            <Pagination
              currentPage={page}
              totalCount={total}
              pageSize={PER_PAGE}
              itemsOnPage={filteredRows.length}
              hasNextPage={page < totalPages}
              onPageChange={setPage}
              className="px-4"
            />
          </ListPaginationBar>
        )}
      </PageCard>

      {/* Import confirmation modal */}
      {importModalOpen && (
        <ImportModal
          preview={importPreview}
          loading={importLoading}
          hasBlockers={hasBlockers}
          count={importingIds.length}
          onConfirm={confirmImport}
          onClose={() => { setImportModalOpen(false); setImportPreview(null); }}
        />
      )}
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Product row                                                         */
/* ------------------------------------------------------------------ */

function ProductRow(props: {
  row: WooSearchRow;
  selected: boolean;
  onToggle: () => void;
  onImport: () => void;
  onView: () => void;
  importing: boolean;
}) {
  const { row, selected, onToggle, onImport, onView, importing } = props;
  const isNew = row.import_status === 'new';
  const [imgError, setImgError] = useState(false);

  return (
    <tr className={`group transition-colors hover:bg-gray-50/50 ${selected ? 'bg-blue-50/40' : ''}`}>
      <td className="px-4 py-3">
        {isNew ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        ) : (
          <div className="h-4 w-4" />
        )}
      </td>
      <td className="px-2 py-3">
        <div className="h-10 w-10 overflow-hidden rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center">
          {row.image && !imgError ? (
            <img
              src={row.image}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <ImageOff className="h-4 w-4 text-gray-300" />
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 truncate max-w-[300px]" title={row.name ?? ''}>
          {row.name || 'Sem nome'}
        </div>
        <div className="text-xs text-gray-400">{row.type === 'variable' ? 'Variável' : 'Simples'}</div>
      </td>
      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{row.sku || '-'}</td>
      <td className="px-4 py-3 text-center">
        {isNew ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            Novo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            <Check className="h-3 w-3" />
            Importado
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-gray-700">
        {row.price ? `R$ ${Number(row.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
      </td>
      <td className="px-4 py-3 text-center">
        <StockBadge status={row.stock_status} />
      </td>
      <td className="px-4 py-3 text-right">
        {isNew ? (
          <Button
            size="sm"
            onClick={onImport}
            disabled={importing}
            className="gap-1.5"
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Importar
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onView}
            className="gap-1.5 text-gray-500"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver no ERP
          </Button>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Stock badge                                                         */
/* ------------------------------------------------------------------ */

function StockBadge({ status }: { status: string | null }) {
  if (status === 'instock') {
    return <span className="text-xs text-emerald-600 font-medium">Em estoque</span>;
  }
  if (status === 'outofstock') {
    return <span className="text-xs text-red-500 font-medium">Esgotado</span>;
  }
  if (status === 'onbackorder') {
    return <span className="text-xs text-amber-600 font-medium">Encomenda</span>;
  }
  return <span className="text-xs text-gray-400">-</span>;
}

/* ------------------------------------------------------------------ */
/* Import confirmation modal                                           */
/* ------------------------------------------------------------------ */

function ImportModal(props: {
  preview: WooCatalogPreviewResponse | null;
  loading: boolean;
  hasBlockers: boolean;
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { preview, loading, hasBlockers, count, onConfirm, onClose } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Confirmar importacao</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5">
          {loading && !preview ? (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <div className="mt-3 text-sm text-gray-500">Analisando {count} produto{count > 1 ? 's' : ''}...</div>
            </div>
          ) : preview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="Criar" value={preview.summary?.create ?? 0} color="emerald" />
                <SummaryCard label="Atualizar" value={preview.summary?.update ?? 0} color="blue" />
                <SummaryCard label="Pular" value={preview.summary?.skip ?? 0} color="gray" />
                <SummaryCard label="Bloquear" value={preview.summary?.block ?? 0} color="red" />
              </div>

              {hasBlockers && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Existem produtos bloqueados. Corrija os problemas antes de importar.
                </div>
              )}

              {(preview.items ?? []).some((i) => i.blockers.length > 0 || i.warnings.length > 0) && (
                <div className="max-h-48 overflow-auto rounded-lg border border-gray-200">
                  {(preview.items ?? [])
                    .filter((i) => i.blockers.length > 0 || i.warnings.length > 0)
                    .map((item, idx) => (
                      <div key={idx} className="border-b border-gray-100 px-3 py-2 last:border-b-0 text-xs">
                        <span className="font-medium text-gray-700">{item.sku || 'sem SKU'}</span>
                        {item.blockers.map((b, i) => (
                          <div key={`b-${i}`} className="text-red-600 mt-0.5">{b}</div>
                        ))}
                        {item.warnings.map((w, i) => (
                          <div key={`w-${i}`} className="text-amber-600 mt-0.5">{w}</div>
                        ))}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading || hasBlockers || !preview}
            className="gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Confirmar importacao
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary card for import preview                                     */
/* ------------------------------------------------------------------ */

function SummaryCard(props: { label: string; value: number; color: 'emerald' | 'blue' | 'gray' | 'red' }) {
  const colors = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
    red: 'border-red-200 bg-red-50 text-red-700',
  };

  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${colors[props.color]}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">{props.label}</div>
      <div className="text-xl font-bold">{props.value}</div>
    </div>
  );
}
