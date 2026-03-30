import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { listEcommerceConnections, type EcommerceConnection } from '@/services/ecommerceIntegrations';
import {
  listProdutoAnunciosForProduct,
  upsertProdutoAnuncio,
  deleteProdutoAnuncio,
  type ProdutoAnuncio,
  type ProdutoAnuncioPayload,
} from '@/services/produtoAnuncios';
import type { ProductFormData } from '@/components/products/ProductFormPanel';
import { Button } from '@/components/ui/button';
import WooCommerceChannelTab from './WooCommerceChannelTab';
import { Store, Plus, Pencil, Trash2, ExternalLink, ShoppingBag } from 'lucide-react';

type Props = {
  data: ProductFormData;
};

const PROVIDER_LABELS: Record<string, string> = {
  meli: 'Mercado Livre',
  shopee: 'Shopee',
  woo: 'WooCommerce',
  amazon: 'Amazon',
  magalu: 'Magalu',
  custom: 'Personalizado',
};

const PROVIDER_COLORS: Record<string, string> = {
  meli: 'bg-yellow-100 text-yellow-800',
  shopee: 'bg-orange-100 text-orange-800',
  woo: 'bg-purple-100 text-purple-800',
  amazon: 'bg-blue-100 text-blue-800',
  magalu: 'bg-blue-100 text-blue-800',
  custom: 'bg-gray-100 text-gray-800',
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  ativo: 'Ativo',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
  erro: 'Erro',
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-700',
  ativo: 'bg-green-100 text-green-800',
  pausado: 'bg-amber-100 text-amber-800',
  finalizado: 'bg-slate-100 text-slate-700',
  erro: 'bg-red-100 text-red-800',
};

interface AnuncioFormState {
  id?: string;
  ecommerce_id: string;
  titulo: string;
  descricao: string;
  preco_especifico: string;
  identificador: string;
  status_anuncio: string;
  categoria_marketplace: string;
}

const EMPTY_FORM: AnuncioFormState = {
  ecommerce_id: '',
  titulo: '',
  descricao: '',
  preco_especifico: '',
  identificador: '',
  status_anuncio: 'rascunho',
  categoria_marketplace: '',
};

export default function MarketplaceChannelTab({ data }: Props) {
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [connections, setConnections] = useState<EcommerceConnection[]>([]);
  const [anuncios, setAnuncios] = useState<ProdutoAnuncio[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingForm, setEditingForm] = useState<AnuncioFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const hasWoo = connections.some((c) => c.provider === 'woo');

  useEffect(() => {
    if (!activeEmpresaId) return;
    listEcommerceConnections().then(setConnections).catch(console.error);
  }, [activeEmpresaId]);

  const fetchAnuncios = async () => {
    if (!data.id) return;
    setLoading(true);
    try {
      const result = await listProdutoAnunciosForProduct(data.id);
      setAnuncios(result);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar anúncios.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAnuncios();
  }, [data.id]);

  const handleNewAnuncio = (ecommerceId?: string) => {
    setEditingForm({ ...EMPTY_FORM, ecommerce_id: ecommerceId || '' });
  };

  const handleEditAnuncio = (a: ProdutoAnuncio) => {
    setEditingForm({
      id: a.id,
      ecommerce_id: a.ecommerce_id,
      titulo: a.titulo ?? '',
      descricao: a.descricao ?? '',
      preco_especifico: a.preco_especifico != null ? String(a.preco_especifico) : '',
      identificador: a.identificador ?? '',
      status_anuncio: a.status_anuncio ?? 'rascunho',
      categoria_marketplace: a.categoria_marketplace ?? '',
    });
  };

  const handleSaveAnuncio = async () => {
    if (!editingForm || !data.id) return;
    if (!editingForm.ecommerce_id) {
      addToast('Selecione um canal.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload: ProdutoAnuncioPayload = {
        id: editingForm.id,
        produto_id: data.id,
        ecommerce_id: editingForm.ecommerce_id,
        titulo: editingForm.titulo || null,
        descricao: editingForm.descricao || null,
        preco_especifico: editingForm.preco_especifico ? parseFloat(editingForm.preco_especifico) : null,
        identificador: editingForm.identificador || null,
        status_anuncio: editingForm.status_anuncio || 'rascunho',
        categoria_marketplace: editingForm.categoria_marketplace || null,
      };
      await upsertProdutoAnuncio(payload);
      addToast('Anúncio salvo com sucesso!', 'success');
      setEditingForm(null);
      await fetchAnuncios();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar anúncio.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAnuncio = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir anúncio',
      description: 'Tem certeza que deseja excluir este anúncio?',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteProdutoAnuncio(id);
      addToast('Anúncio excluído.', 'success');
      await fetchAnuncios();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir.', 'error');
    }
  };

  if (!data.id) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Salve o produto para gerenciar anúncios em marketplaces.
      </div>
    );
  }

  // Non-woo connections for the anúncios section
  const nonWooConnections = connections.filter((c) => c.provider !== 'woo');
  const allConnectionsForSelect = connections.filter((c) => c.provider !== 'woo');

  return (
    <div className="space-y-6">
      {/* WooCommerce Section */}
      {hasWoo && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
              WooCommerce
            </span>
            <span className="text-sm text-gray-500">Integração completa com sincronização</span>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <WooCommerceChannelTab data={data} />
          </div>
        </div>
      )}

      {/* Marketplace Anúncios Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-800">Anúncios por Canal</h3>
          </div>
          <Button variant="secondary" size="sm" onClick={() => handleNewAnuncio()}>
            <Plus size={14} className="mr-1" /> Novo Anúncio
          </Button>
        </div>

        {/* Editing form */}
        {editingForm && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 mb-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Canal</label>
                <select
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={editingForm.ecommerce_id}
                  onChange={(e) => setEditingForm({ ...editingForm, ecommerce_id: e.target.value })}
                  disabled={!!editingForm.id}
                >
                  <option value="">Selecione...</option>
                  {allConnectionsForSelect.map((c) => (
                    <option key={c.id} value={c.id}>
                      {PROVIDER_LABELS[c.provider] || c.provider} — {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Status do Anúncio</label>
                <select
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={editingForm.status_anuncio}
                  onChange={(e) => setEditingForm({ ...editingForm, status_anuncio: e.target.value })}
                >
                  <option value="rascunho">Rascunho</option>
                  <option value="ativo">Ativo</option>
                  <option value="pausado">Pausado</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Título do Anúncio</label>
                <input
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editingForm.titulo}
                  onChange={(e) => setEditingForm({ ...editingForm, titulo: e.target.value })}
                  placeholder={data.nome || 'Título para o marketplace...'}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Preço Específico</label>
                <input
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editingForm.preco_especifico}
                  onChange={(e) => setEditingForm({ ...editingForm, preco_especifico: e.target.value })}
                  placeholder="Deixe vazio para usar o preço padrão"
                  type="number"
                  step="0.01"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Identificador (SKU no canal)</label>
                <input
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editingForm.identificador}
                  onChange={(e) => setEditingForm({ ...editingForm, identificador: e.target.value })}
                  placeholder={data.sku || 'SKU no marketplace'}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Categoria no Marketplace</label>
                <input
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editingForm.categoria_marketplace}
                  onChange={(e) => setEditingForm({ ...editingForm, categoria_marketplace: e.target.value })}
                  placeholder="Ex: Eletrônicos > Celulares > Smartphones"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Descrição</label>
                <textarea
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editingForm.descricao}
                  onChange={(e) => setEditingForm({ ...editingForm, descricao: e.target.value })}
                  placeholder="Descrição específica para este canal (opcional)"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingForm(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveAnuncio} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar Anúncio'}
              </Button>
            </div>
          </div>
        )}

        {/* Anúncios list */}
        {loading ? (
          <div className="text-sm text-gray-500 py-3">Carregando anúncios...</div>
        ) : anuncios.length === 0 && !editingForm ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <Store size={32} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500">Nenhum anúncio configurado para este produto.</p>
            <p className="text-xs text-gray-400 mt-1">Crie anúncios para gerenciar a presença deste produto em cada marketplace.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {anuncios.map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-3 flex items-center justify-between hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${PROVIDER_COLORS[a.ecommerce_provider] || PROVIDER_COLORS.custom}`}>
                    {PROVIDER_LABELS[a.ecommerce_provider] || a.ecommerce_provider}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[a.status_anuncio] || STATUS_COLORS.rascunho}`}>
                    {STATUS_LABELS[a.status_anuncio] || a.status_anuncio}
                  </span>
                  <span className="text-sm text-gray-800 truncate" title={a.titulo || data.nome || ''}>
                    {a.titulo || data.nome || 'Sem título'}
                  </span>
                  {a.preco_especifico != null && (
                    <span className="text-xs text-gray-500">
                      R$ {Number(a.preco_especifico).toFixed(2)}
                    </span>
                  )}
                  {a.url_anuncio && (
                    <a href={a.url_anuncio} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => handleEditAnuncio(a)} className="p-1 text-blue-600 hover:text-blue-800" title="Editar">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDeleteAnuncio(a.id)} className="p-1 text-red-500 hover:text-red-700" title="Excluir">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {connections.length === 0 && !loading && (
          <div className="mt-3 text-xs text-gray-400">
            Nenhum canal de e-commerce configurado. Configure em Integrações para criar anúncios.
          </div>
        )}
      </div>
    </div>
  );
}
