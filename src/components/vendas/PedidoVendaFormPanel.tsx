import React, { useState, useEffect } from 'react';
import { Loader2, Save, CheckCircle, Trash2, AlertTriangle } from 'lucide-react';
import { VendaDetails, VendaPayload, saveVenda, manageVendaItem, getVendaDetails, aprovarVenda } from '@/services/vendas';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { useNumericField } from '@/hooks/useNumericField';

interface Props {
  vendaId: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function PedidoVendaFormPanel({ vendaId, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(!!vendaId);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<VendaDetails>>({
    status: 'orcamento',
    data_emissao: new Date().toISOString().split('T')[0],
    frete: 0,
    desconto: 0,
    total_geral: 0,
    itens: []
  });

  const freteProps = useNumericField(formData.frete, (v) => handleHeaderChange('frete', v));
  const descontoProps = useNumericField(formData.desconto, (v) => handleHeaderChange('desconto', v));

  useEffect(() => {
    if (vendaId) {
      loadDetails();
    }
  }, [vendaId]);

  const loadDetails = async () => {
    try {
      const data = await getVendaDetails(vendaId!);
      setFormData(data);
    } catch (e) {
      console.error(e);
      addToast('Erro ao carregar pedido.', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (field: keyof VendaPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveHeader = async () => {
    if (!formData.cliente_id) {
      addToast('Selecione um cliente.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const payload: VendaPayload = {
        id: formData.id,
        cliente_id: formData.cliente_id,
        data_emissao: formData.data_emissao,
        data_entrega: formData.data_entrega,
        status: formData.status,
        frete: formData.frete,
        desconto: formData.desconto,
        condicao_pagamento: formData.condicao_pagamento,
        observacoes: formData.observacoes
      };
      const saved = await saveVenda(payload);
      setFormData(prev => ({ ...prev, ...saved }));
      
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
    if (item.type !== 'product') {
        addToast('Apenas produtos podem ser adicionados a pedidos de venda.', 'warning');
        return;
    }

    let currentId = formData.id;
    if (!currentId) {
      currentId = await handleSaveHeader();
      if (!currentId) return;
    }

    try {
      await manageVendaItem(currentId!, null, item.id, 1, item.preco_venda || 0, 0, 'add');
      await loadDetails();
      addToast('Item adicionado.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await manageVendaItem(formData.id!, itemId, '', 0, 0, 0, 'remove');
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
      preco_unitario: field === 'preco' ? value : item.preco_unitario,
      desconto: field === 'desconto' ? value : item.desconto,
    };

    try {
      await manageVendaItem(formData.id!, itemId, item.produto_id, updates.quantidade, updates.preco_unitario, updates.desconto, 'update');
      // Atualização otimista
      setFormData(prev => ({
        ...prev,
        itens: prev.itens?.map(i => i.id === itemId ? { 
            ...i, 
            ...updates, 
            total: (updates.quantidade * updates.preco_unitario) - updates.desconto 
        } : i)
      }));
      // Recarregar totais no blur ou debounce seria ideal, aqui faremos reload completo ao salvar o cabeçalho novamente
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleAprovar = async () => {
    if (!confirm('Confirmar aprovação do pedido?')) return;
    setIsSaving(true);
    try {
      await aprovarVenda(formData.id!);
      addToast('Pedido aprovado com sucesso!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const isLocked = formData.status !== 'orcamento';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {formData.numero && (
          <div className="mb-4 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Pedido {formData.numero}</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase ${
                formData.status === 'aprovado' ? 'bg-green-100 text-green-800' : 
                formData.status === 'cancelado' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
            }`}>
              {formData.status}
            </span>
          </div>
        )}

        <Section title="Dados do Pedido" description="Informações do cliente e condições.">
          <div className="sm:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <ClientAutocomplete
              value={formData.cliente_id || null}
              initialName={formData.cliente_nome}
              onChange={(id, name) => {
                handleHeaderChange('cliente_id', id);
                if (name) handleHeaderChange('cliente_nome', name);
              }}
              disabled={isLocked}
            />
          </div>
          <div className="sm:col-span-2">
             <Input label="Data Emissão" type="date" value={formData.data_emissao} onChange={e => handleHeaderChange('data_emissao', e.target.value)} disabled={isLocked} />
          </div>
          <div className="sm:col-span-3">
             <Input label="Data Entrega" type="date" value={formData.data_entrega || ''} onChange={e => handleHeaderChange('data_entrega', e.target.value)} disabled={isLocked} />
          </div>
          <div className="sm:col-span-3">
             <Input label="Condição Pagamento" name="condicao_pagamento" value={formData.condicao_pagamento || ''} onChange={e => handleHeaderChange('condicao_pagamento', e.target.value)} disabled={isLocked} placeholder="Ex: 30/60 dias" />
          </div>
        </Section>

        <Section title="Itens" description="Produtos vendidos.">
          {!isLocked && (
            <div className="sm:col-span-6 mb-4">
              <ItemAutocomplete onSelect={handleAddItem} />
            </div>
          )}
          
          <div className="sm:col-span-6 overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Produto</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-24">Qtd</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-32">Preço Unit.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-24">Desc.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-32">Total</th>
                  {!isLocked && <th className="px-3 py-2 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {formData.itens?.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-sm text-gray-900">
                      {item.produto_nome}
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="number" 
                        value={item.quantidade} 
                        onChange={e => handleUpdateItem(item.id, 'quantidade', parseFloat(e.target.value))}
                        disabled={isLocked}
                        className="w-full text-right p-1 border rounded text-sm"
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
                        className="w-full text-right p-1 border rounded text-sm"
                        step="0.01"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="number" 
                        value={item.desconto} 
                        onChange={e => handleUpdateItem(item.id, 'desconto', parseFloat(e.target.value))}
                        disabled={isLocked}
                        className="w-full text-right p-1 border rounded text-sm"
                        step="0.01"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}
                    </td>
                    {!isLocked && (
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {formData.itens?.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-500">Nenhum item adicionado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Totais" description="Valores finais.">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Produtos</label>
            <div className="p-3 bg-gray-100 rounded-lg text-right font-semibold text-gray-700">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.itens?.reduce((acc, i) => acc + i.total, 0) || 0)}
            </div>
          </div>
          <Input label="Frete (R$)" name="frete" {...freteProps} disabled={isLocked} className="sm:col-span-2" />
          <Input label="Desconto Extra (R$)" name="desconto" {...descontoProps} disabled={isLocked} className="sm:col-span-2" />
          
          <div className="sm:col-span-6 flex justify-end mt-4 pt-4 border-t border-gray-100">
            <div className="text-2xl font-bold text-blue-800">
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
              onClick={handleAprovar} 
              disabled={isSaving || (formData.itens?.length || 0) === 0}
              className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle size={20} /> Aprovar Venda
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
