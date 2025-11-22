import React, { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Trash2, Package, CheckCircle } from 'lucide-react';
import { CompraDetails, CompraPayload, saveCompra, manageCompraItem, getCompraDetails, receberCompra } from '@/services/compras';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import SupplierAutocomplete from '@/components/common/SupplierAutocomplete';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { useNumericField } from '@/hooks/useNumericField';

interface Props {
  compraId: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function CompraFormPanel({ compraId, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
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
    if (!confirm('Confirmar recebimento? Isso irá lançar a entrada dos produtos no estoque.')) return;
    setIsSaving(true);
    try {
      await receberCompra(formData.id!);
      addToast('Pedido recebido e estoque atualizado!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const isLocked = formData.status === 'recebido' || formData.status === 'cancelado';

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

        <Section title="Itens" description="Produtos a serem comprados.">
          {!isLocked && (
            <div className="sm:col-span-6 mb-4">
              <ItemAutocomplete onSelect={handleAddItem} />
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
                      <input 
                        type="number" 
                        value={item.preco_unitario} 
                        onChange={e => handleUpdateItem(item.id, 'preco', parseFloat(e.target.value))}
                        disabled={isLocked}
                        className="w-full text-right p-1 border rounded"
                        step="0.01"
                      />
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
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.itens?.reduce((acc, i) => acc + i.total, 0) || 0)}
            </div>
          </div>
          <Input label="Frete (R$)" name="frete" {...freteProps} disabled={isLocked} className="sm:col-span-2" />
          <Input label="Desconto (R$)" name="desconto" {...descontoProps} disabled={isLocked} className="sm:col-span-2" />
          
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
    </div>
  );
}
