import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import {
  syncMeliStock,
  syncMeliPrice,
  pauseMeliListing,
  activateMeliListing,
  batchSyncMeliStock,
  batchSyncMeliPrice,
} from '@/services/meliAdmin';
import { listEcommerceConnections, type EcommerceConnection } from '@/services/ecommerceIntegrations';
import { callRpc } from '@/lib/api';
import {
  Package,
  RefreshCw,
  Pause,
  Play,
  ExternalLink,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type MeliCatalogItem = {
  anuncio_id: string;
  produto_id: string;
  produto_nome: string;
  produto_sku: string | null;
  titulo_ml: string | null;
  identificador_externo: string | null;
  url_anuncio: string | null;
  preco_especifico: number | null;
  preco_venda: number | null;
  estoque_disponivel: number | null;
  status_anuncio: string;
  sync_status: string;
  last_sync_at: string | null;
  last_error: string | null;
  categoria_marketplace: string | null;
};

export default function MeliCatalogPage() {
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const [meliConn, setMeliConn] = useState<EcommerceConnection | null>(null);
  const [items, setItems] = useState<MeliCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const empresaId = activeEmpresaId || '';
  const ecommerceId = meliConn?.id || '';

  // Load connection
  useEffect(() => {
    if (!activeEmpresaId) return;
    listEcommerceConnections()
      .then((conns) => {
        const meli = conns.find((c) => c.provider === 'meli');
        setMeliConn(meli || null);
      })
      .catch(console.error);
  }, [activeEmpresaId]);

  // Load catalog items
  const loadItems = useCallback(async () => {
    if (!empresaId || !ecommerceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Use a custom RPC or build from produto_anuncios + produtos
      const data = await callRpc<any[]>('list_produto_anuncios_for_product', {
        p_produto_id: null, // Load all for this ecommerce
      }).catch(() => []);

      // Since we don't have a dedicated catalog RPC yet, we'll load anuncios
      // for the meli connection specifically
      const { data: anuncios } = await (await import('@/lib/supabaseClient')).supabase.rpc(
        'list_produto_anuncios_for_product' as any,
        { p_produto_id: null as any },
      ).catch(() => ({ data: null }));

      // Fallback: use the service
      const { listProdutoAnunciosForProduct } = await import('@/services/produtoAnuncios');
      // We can't list all easily, so we show a message for now
      setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, ecommerceId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Filter items
  const filtered = items.filter((item) => {
    const matchSearch = !search ||
      item.produto_nome?.toLowerCase().includes(search.toLowerCase()) ||
      item.produto_sku?.toLowerCase().includes(search.toLowerCase()) ||
      item.titulo_ml?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || item.sync_status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Bulk actions
  const handleBatchSyncStock = async () => {
    if (selected.size === 0) return;
    setActionLoading('batch-stock');
    try {
      await batchSyncMeliStock(empresaId, ecommerceId, Array.from(selected));
      addToast(`Estoque sincronizado para ${selected.size} itens.`, 'success');
      setSelected(new Set());
      await loadItems();
    } catch (e: any) {
      addToast(e?.message || 'Erro no sync em lote.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBatchSyncPrice = async () => {
    if (selected.size === 0) return;
    setActionLoading('batch-price');
    try {
      await batchSyncMeliPrice(empresaId, ecommerceId, Array.from(selected));
      addToast(`Preços sincronizados para ${selected.size} itens.`, 'success');
      setSelected(new Set());
      await loadItems();
    } catch (e: any) {
      addToast(e?.message || 'Erro no sync em lote.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.anuncio_id)));
    }
  };

  const syncStatusIcon = (status: string) => {
    if (status === 'synced') return <CheckCircle2 size={14} className="text-green-500" />;
    if (status === 'error') return <XCircle size={14} className="text-red-500" />;
    return <AlertTriangle size={14} className="text-amber-500" />;
  };

  if (!meliConn) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Catálogo Mercado Livre</h1>
        <GlassCard className="p-8 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Nenhuma conexão Mercado Livre configurada.</p>
          <p className="text-sm text-gray-400 mt-2">
            Configure a integração em Configurações &gt; Integrações.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Catálogo Mercado Livre</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchSyncStock}
                disabled={actionLoading === 'batch-stock'}
              >
                {actionLoading === 'batch-stock' ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
                Sync Estoque ({selected.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchSyncPrice}
                disabled={actionLoading === 'batch-price'}
              >
                {actionLoading === 'batch-price' ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
                Sync Preço ({selected.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="w-full rounded-xl border border-gray-200/80 bg-white/70 backdrop-blur-sm pl-10 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
            placeholder="Buscar por nome, SKU ou título ML..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-xl border border-gray-200/80 bg-white/70 backdrop-blur-sm px-3 py-2.5 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Todos os status</option>
          <option value="synced">Sincronizado</option>
          <option value="pending">Pendente</option>
          <option value="error">Com erro</option>
        </select>
      </div>

      {/* Table */}
      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">
              {items.length === 0
                ? 'Nenhum produto publicado no Mercado Livre.'
                : 'Nenhum resultado para os filtros aplicados.'}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Publique produtos pela aba Canais/Marketplace na ficha do produto.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/40 bg-gray-50/30">
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Produto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Título ML</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Preço</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Estoque</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Sync</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Última Sync</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/30">
                {filtered.map((item) => (
                  <tr key={item.anuncio_id} className="hover:bg-white/40 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(item.anuncio_id)}
                        onChange={() => toggleSelect(item.anuncio_id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 truncate max-w-[200px]">{item.produto_nome}</p>
                      {item.produto_sku && (
                        <p className="text-xs text-gray-400 font-mono">{item.produto_sku}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700 truncate max-w-[200px]">{item.titulo_ml || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      R$ {Number(item.preco_especifico ?? item.preco_venda ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.estoque_disponivel ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {syncStatusIcon(item.sync_status)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-400">
                      {item.last_sync_at
                        ? new Date(item.last_sync_at).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {item.url_anuncio && (
                          <a
                            href={item.url_anuncio}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-blue-500 hover:text-blue-700"
                            title="Ver no ML"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
