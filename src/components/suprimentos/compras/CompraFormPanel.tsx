import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle, Loader2, Save, Trash2, Wand2 } from 'lucide-react';
import { CompraDetails, CompraPayload, saveCompra, manageCompraItem, getCompraDetails, receberCompra } from '@/services/compras';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { useNavigate } from 'react-router-dom';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import SupplierAutocomplete from '@/components/common/SupplierAutocomplete';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { useNumericField } from '@/hooks/useNumericField';
import Modal from '@/components/ui/Modal';
import { getRelatorioBaixoEstoque, type RelatorioBaixoEstoqueItem } from '@/services/suprimentos';
import { listMrpDemandas, type MrpDemanda } from '@/services/industriaProducao';
import { createContaPagarFromCompra, getContaPagarFromCompra } from '@/services/financeiro';

interface Props {
  compraId: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function CompraFormPanel({ compraId, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!!compraId);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<CompraDetails>>({
    status: 'rascunho',
    data_emissao: new Date().toISOString().split('T')[0],
    frete: 0,
    desconto: 0,
    total_geral: 0,
    itens: []
  });

  const freteProps = useNumericField(formData.frete, (v) => handleHeaderChange('frete', v));
  const descontoProps = useNumericField(formData.desconto, (v) => handleHeaderChange('desconto', v));

  useEffect(() => {
    if (compraId) {
      loadDetails();
    }
  }, [compraId]);

  const loadDetails = async () => {
    try {
      const data = await getCompraDetails(compraId!);
      setFormData(data);
    } catch (e) {
      console.error(e);
      addToast('Erro ao carregar pedido.', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (field: keyof CompraPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveHeader = async () => {
    if (!formData.fornecedor_id) {
      addToast('Selecione um fornecedor.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const payload: CompraPayload = {
        id: formData.id,
        fornecedor_id: formData.fornecedor_id,
        data_emissao: formData.data_emissao,
        data_prevista: formData.data_prevista,
        status: formData.status,
        frete: formData.frete,
        desconto: formData.desconto,
        observacoes: formData.observacoes
      };
      const saved = await saveCompra(payload);
      setFormData(prev => ({ ...prev, ...saved })); // Update ID and totals
      if (!formData.id) {
        addToast('Pedido criado! Agora adicione os itens.', 'success');
      } else {
        addToast('Pedido salvo.', 'success');
      }
      return saved.id;
    } catch (e: any) {
      addToast(e.message, 'error');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddItem = async (item: any) => {
    let currentId = formData.id;
    if (!currentId) {
      currentId = await handleSaveHeader();
      if (!currentId) return;
    }

    try {
      await manageCompraItem(currentId!, null, item.id, 1, item.preco_venda || 0, 'upsert');
      await loadDetails(); // Reload to get updated totals and items
      addToast('Item adicionado.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await manageCompraItem(formData.id!, itemId, '', 0, 0, 'delete');
      await loadDetails();
      addToast('Item removido.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleUpdateItem = async (itemId: string, field: string, value: number) => {
    const item = formData.itens?.find(i => i.id === itemId);
    if (!item) return;
    
    const updates = {
      quantidade: field === 'quantidade' ? value : item.quantidade,
      preco_unitario: field === 'preco' ? value : item.preco_unitario
    };

    try {
      await manageCompraItem(formData.id!, itemId, item.produto_id, updates.quantidade, updates.preco_unitario, 'upsert');
      // Optimistic update for UI responsiveness
      setFormData(prev => ({
        ...prev,
        itens: prev.itens?.map(i => i.id === itemId ? { ...i, ...updates, total: updates.quantidade * updates.preco_unitario } : i)
      }));
      // Debounce reload or reload on blur could be better, but for simplicity:
      // await loadDetails(); 
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleReceber = async () => {
    const ok = await confirm({
      title: 'Confirmar recebimento',
      description: 'Confirmar recebimento? Isso irá lançar a entrada dos produtos no estoque.',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      await receberCompra(formData.id!);
      addToast('Pedido recebido e estoque atualizado!', 'success');
      onSaveSuccess();

      const wantConta = await confirm({
        title: 'Gerar Conta a Pagar',
        description: 'Deseja gerar automaticamente uma Conta a Pagar a partir desta compra recebida?',
        confirmText: 'Gerar agora',
        cancelText: 'Agora não',
        variant: 'default',
      });
      if (!wantConta) return;

      const existing = await getContaPagarFromCompra(String(formData.id));
      const contaId =
        existing ||
        (await createContaPagarFromCompra({
          compraId: String(formData.id),
          dataVencimento: null,
        }));
      addToast('Conta a pagar gerada com sucesso!', 'success');
      navigate(`/app/financeiro/contas-a-pagar?contaId=${encodeURIComponent(contaId)}`);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const isLocked = formData.status === 'recebido' || formData.status === 'cancelado';
  const totalItens = useMemo(() => formData.itens?.reduce((acc, i) => acc + i.total, 0) || 0, [formData.itens]);

  // ---------------------------------------------------------------------------
  // Sugestões (Baixo estoque / MRP)
  // ---------------------------------------------------------------------------
  type SuggestionTab = 'baixo_estoque' | 'mrp';
  const [isSugestoesOpen, setIsSugestoesOpen] = useState(false);
  const [sugestaoTab, setSugestaoTab] = useState<SuggestionTab>('baixo_estoque');
  const [sugestaoLoading, setSugestaoLoading] = useState(false);
  const [sugestaoSearch, setSugestaoSearch] = useState('');
  const [baixoEstoque, setBaixoEstoque] = useState<RelatorioBaixoEstoqueItem[]>([]);
  const [mrpDemandas, setMrpDemandas] = useState<MrpDemanda[]>([]);

  type SelectedItem = { produto_id: string; nome: string; quantidade: number; preco_unitario: number };
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});

  const filteredBaixoEstoque = useMemo(() => {
    const q = sugestaoSearch.trim().toLowerCase();
    if (!q) return baixoEstoque;
    return baixoEstoque.filter((i) => (i.nome || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q));
  }, [baixoEstoque, sugestaoSearch]);

  const filteredMrp = useMemo(() => {
    const q = sugestaoSearch.trim().toLowerCase();
    if (!q) return mrpDemandas;
    return mrpDemandas.filter((d) => (d.produto_nome || '').toLowerCase().includes(q));
  }, [mrpDemandas, sugestaoSearch]);

  const loadSugestoes = async (tab: SuggestionTab) => {
    setSugestaoLoading(true);
    try {
      if (tab === 'baixo_estoque') {
        const data = await getRelatorioBaixoEstoque();
        setBaixoEstoque(data);
      } else {
        const data = await listMrpDemandas('pendente');
        setMrpDemandas(data);
      }
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar sugestões.', 'error');
    } finally {
      setSugestaoLoading(false);
    }
  };

  const openSugestoes = async (tab: SuggestionTab) => {
    setSugestaoTab(tab);
    setSugestaoSearch('');
    setSelected({});
    setIsSugestoesOpen(true);
    await loadSugestoes(tab);
  };

  const toggleSelected = (produto_id: string, initial: SelectedItem) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[produto_id]) {
        delete next[produto_id];
      } else {
        next[produto_id] = initial;
      }
      return next;
    });
  };

  const updateSelectedQty = (produto_id: string, quantidade: number) => {
    setSelected((prev) => ({
      ...prev,
      [produto_id]: { ...prev[produto_id], quantidade: Number.isFinite(quantidade) ? quantidade : prev[produto_id].quantidade },
    }));
  };

  const updateSelectedPrice = (produto_id: string, preco_unitario: number) => {
    setSelected((prev) => ({
      ...prev,
      [produto_id]: { ...prev[produto_id], preco_unitario: Number.isFinite(preco_unitario) ? preco_unitario : prev[produto_id].preco_unitario },
    }));
  };

  const addSelectedToPedido = async () => {
    const items = Object.values(selected).filter((i) => (i.quantidade || 0) > 0);
    if (items.length === 0) {
      addToast('Selecione ao menos um item com quantidade > 0.', 'error');
      return;
    }

    let currentId = formData.id;
    if (!currentId) {
      currentId = await handleSaveHeader();
      if (!currentId) return;
    }

    setSugestaoLoading(true);
    try {
      for (const item of items) {
        await manageCompraItem(currentId!, null, item.produto_id, item.quantidade, item.preco_unitario || 0, 'upsert');
      }
      await loadDetails();
      addToast(`${items.length} item(ns) adicionados ao pedido.`, 'success');
      setIsSugestoesOpen(false);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao adicionar itens ao pedido.', 'error');
    } finally {
      setSugestaoLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {formData.numero && (
          <div className="mb-4 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Pedido #{formData.numero}</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase ${formData.status === 'recebido' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
              {formData.status}
            </span>
          </div>
        )}

        <Section title="Dados do Pedido" description="Informações do fornecedor e datas.">
          <div className="sm:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
            <SupplierAutocomplete
              value={formData.fornecedor_id || null}
              initialName={formData.fornecedor_nome}
              onChange={(id, name) => {
                handleHeaderChange('fornecedor_id', id);
                if (name) handleHeaderChange('fornecedor_nome', name);
              }}
              disabled={isLocked}
            />
          </div>
          <Select label="Status" name="status" value={formData.status} onChange={e => handleHeaderChange('status', e.target.value)} disabled={isLocked} className="sm:col-span-2">
            <option value="rascunho">Rascunho</option>
            <option value="enviado">Enviado</option>
            <option value="recebido" disabled>Recebido</option>
            <option value="cancelado">Cancelado</option>
          </Select>
          <Input label="Data Emissão" type="date" value={formData.data_emissao} onChange={e => handleHeaderChange('data_emissao', e.target.value)} disabled={isLocked} className="sm:col-span-3" />
          <Input label="Data Prevista" type="date" value={formData.data_prevista || ''} onChange={e => handleHeaderChange('data_prevista', e.target.value)} disabled={isLocked} className="sm:col-span-3" />
        </Section>

        {formData.id ? (
          <Section title="Histórico" description="Datas e auditoria simples do pedido.">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Criado em</label>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-800">
                {formData.created_at ? new Date(formData.created_at).toLocaleString('pt-BR') : '—'}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Atualizado em</label>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-800">
                {formData.updated_at ? new Date(formData.updated_at).toLocaleString('pt-BR') : '—'}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Recebido em</label>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-800">
                {formData.data_recebimento ? new Date(String(formData.data_recebimento)).toLocaleDateString('pt-BR') : '—'}
              </div>
            </div>
          </Section>
        ) : null}

        <Section title="Itens" description="Produtos a serem comprados.">
          {!isLocked && (
            <div className="sm:col-span-6 mb-4 flex flex-col gap-2">
              <ItemAutocomplete onSelect={handleAddItem} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openSugestoes('baixo_estoque')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-100 hover:bg-amber-100 transition-colors text-sm font-semibold"
                  title="Adicionar itens sugeridos com base em baixo estoque"
                >
                  <AlertTriangle size={16} /> Sugestões (Baixo estoque)
                </button>
                <button
                  type="button"
                  onClick={() => void openSugestoes('mrp')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-800 border border-blue-100 hover:bg-blue-100 transition-colors text-sm font-semibold"
                  title="Adicionar itens sugeridos com base em demandas do MRP"
                >
                  <BarChart3 size={16} /> Sugestões (MRP)
                </button>
              </div>
            </div>
          )}
          
          <div className="sm:col-span-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Produto</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-24">Qtd</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-32">Preço Unit.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-32">Total</th>
                  {!isLocked && <th className="px-3 py-2 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {formData.itens?.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-sm text-gray-900">
                      {item.produto_nome}
                      <span className="text-xs text-gray-500 ml-1">({item.unidade})</span>
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="number" 
                        value={item.quantidade} 
                        onChange={e => handleUpdateItem(item.id, 'quantidade', parseFloat(e.target.value))}
                        disabled={isLocked}
                        className="w-full text-right p-1 border rounded"
                        min="0.001"
                        step="any"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-xs text-gray-500">R$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.preco_unitario || 0)}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '');
                            const numberValue = digits ? parseInt(digits, 10) / 100 : 0;
                            handleUpdateItem(item.id, 'preco', numberValue);
                          }}
                          disabled={isLocked}
                          className="w-full text-right p-1 border rounded pl-8"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}
                    </td>
                    {!isLocked && (
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {formData.itens?.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-4 text-gray-500">Nenhum item adicionado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Totais" description="Valores finais do pedido.">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Produtos</label>
            <div className="p-3 bg-gray-100 rounded-lg text-right font-semibold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalItens)}
            </div>
          </div>
          <Input label="Frete" name="frete" startAdornment="R$" inputMode="numeric" {...freteProps} disabled={isLocked} className="sm:col-span-2" />
          <Input label="Desconto" name="desconto" startAdornment="R$" inputMode="numeric" {...descontoProps} disabled={isLocked} className="sm:col-span-2" />
          
          <div className="sm:col-span-6 flex justify-end mt-2">
            <div className="text-xl font-bold text-blue-800">
              Total Geral: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.total_geral || 0)}
            </div>
          </div>

          <TextArea label="Observações" name="observacoes" value={formData.observacoes || ''} onChange={e => handleHeaderChange('observacoes', e.target.value)} rows={3} disabled={isLocked} className="sm:col-span-6" />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-between items-center border-t border-white/20 bg-gray-50">
        <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white">
          Fechar
        </button>
        <div className="flex gap-3">
          {formData.id && !isLocked && (
            <button 
              onClick={handleReceber} 
              disabled={isSaving}
              className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle size={20} /> Receber Pedido
            </button>
          )}
          {!isLocked && (
            <button 
              onClick={handleSaveHeader} 
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Salvar
            </button>
          )}
        </div>
      </footer>

      <Modal
        isOpen={isSugestoesOpen}
        onClose={() => setIsSugestoesOpen(false)}
        title="Sugestões para Ordem de Compra"
        size="5xl"
        containerClassName="h-[80vh] max-h-[80vh]"
      >
        <div className="p-6 space-y-4 h-full flex flex-col">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Wand2 className="text-blue-600" size={18} />
              <div>
                <p className="font-semibold text-gray-900">
                  {sugestaoTab === 'baixo_estoque' ? 'Baixo estoque / reposição' : 'Demandas MRP'}
                </p>
                <p className="text-xs text-gray-500">
                  Selecione itens e ajuste quantidades antes de adicionar ao pedido.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadSugestoes(sugestaoTab)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white bg-gray-50 text-sm font-semibold"
                disabled={sugestaoLoading}
              >
                Atualizar
              </button>
              <button
                type="button"
                onClick={addSelectedToPedido}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold disabled:opacity-60"
                disabled={sugestaoLoading}
              >
                Adicionar selecionados
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSugestaoTab('baixo_estoque');
                void loadSugestoes('baixo_estoque');
              }}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                sugestaoTab === 'baixo_estoque'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-900 border border-amber-100 hover:bg-amber-100'
              }`}
              disabled={sugestaoLoading}
            >
              Baixo estoque
            </button>
            <button
              type="button"
              onClick={() => {
                setSugestaoTab('mrp');
                void loadSugestoes('mrp');
              }}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                sugestaoTab === 'mrp'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-900 border border-blue-100 hover:bg-blue-100'
              }`}
              disabled={sugestaoLoading}
            >
              MRP
            </button>
          </div>

          <div className="relative max-w-lg">
            <input
              className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
              placeholder="Filtrar por nome/SKU..."
              value={sugestaoSearch}
              onChange={(e) => setSugestaoSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-auto border border-gray-200 rounded-xl bg-white">
            {sugestaoLoading ? (
              <div className="flex justify-center items-center h-48">
                <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 w-10"></th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Item</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 w-32">Qtd.</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 w-36">Preço (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sugestaoTab === 'baixo_estoque' ? (
                    filteredBaixoEstoque.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                          Nenhum item encontrado.
                        </td>
                      </tr>
                    ) : (
                      filteredBaixoEstoque.map((item) => {
                        const checked = !!selected[item.produto_id];
                        const qty = selected[item.produto_id]?.quantidade ?? (item.sugestao_compra || 0);
                        const price = selected[item.produto_id]?.preco_unitario ?? 0;
                        return (
                          <tr key={item.produto_id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleSelected(item.produto_id, {
                                    produto_id: item.produto_id,
                                    nome: item.nome,
                                    quantidade: item.sugestao_compra || 0,
                                    preco_unitario: 0,
                                  })
                                }
                              />
                            </td>
                            <td className="px-4 py-2">
                              <div className="font-medium text-gray-900">{item.nome}</div>
                              <div className="text-xs text-gray-500">
                                SKU: {item.sku || '—'} · Saldo: {item.saldo} · Mín: {item.estoque_min || 0} · Máx:{' '}
                                {item.estoque_max || 0}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <input
                                type="number"
                                value={qty}
                                min="0"
                                step="any"
                                disabled={!checked}
                                onChange={(e) => updateSelectedQty(item.produto_id, Number(e.target.value))}
                                className="w-full text-right p-2 border rounded-lg disabled:bg-gray-100"
                              />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <input
                                type="number"
                                value={price}
                                min="0"
                                step="0.01"
                                disabled={!checked}
                                onChange={(e) => updateSelectedPrice(item.produto_id, Number(e.target.value))}
                                className="w-full text-right p-2 border rounded-lg disabled:bg-gray-100"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )
                  ) : filteredMrp.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        Nenhuma demanda pendente encontrada.
                      </td>
                    </tr>
                  ) : (
                    filteredMrp.map((d) => {
                      const checked = !!selected[d.produto_id];
                      const qty = selected[d.produto_id]?.quantidade ?? (d.necessidade_liquida || 0);
                      const price = selected[d.produto_id]?.preco_unitario ?? 0;
                      return (
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggleSelected(d.produto_id, {
                                  produto_id: d.produto_id,
                                  nome: d.produto_nome,
                                  quantidade: d.necessidade_liquida || 0,
                                  preco_unitario: 0,
                                })
                              }
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900">{d.produto_nome}</div>
                            <div className="text-xs text-gray-500">
                              Necessidade líquida: {d.necessidade_liquida} · Prioridade: {d.prioridade}
                              {d.mensagem ? ` · ${d.mensagem}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              value={qty}
                              min="0"
                              step="any"
                              disabled={!checked}
                              onChange={(e) => updateSelectedQty(d.produto_id, Number(e.target.value))}
                              className="w-full text-right p-2 border rounded-lg disabled:bg-gray-100"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              value={price}
                              min="0"
                              step="0.01"
                              disabled={!checked}
                              onChange={(e) => updateSelectedPrice(d.produto_id, Number(e.target.value))}
                              className="w-full text-right p-2 border rounded-lg disabled:bg-gray-100"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
