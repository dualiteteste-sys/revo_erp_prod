import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Loader2, Save, ShieldAlert, Trash2, Ban, PackageCheck, ScanBarcode } from 'lucide-react';
import { VendaDetails, VendaPayload, saveVenda, manageVendaItem, getVendaDetails, aprovarVenda, concluirVendaPedido } from '@/services/vendas';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { useNumericField } from '@/hooks/useNumericField';
import { useHasPermission } from '@/hooks/useHasPermission';
import { searchItemsForOs } from '@/services/os';
import { ensurePdvDefaultClienteId } from '@/services/vendasMvp';

interface Props {
  vendaId: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
  mode?: 'erp' | 'pdv';
  onFinalizePdv?: (pedidoId: string) => Promise<void>;
}

function toMoney(n: number | null | undefined): number {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function formatMoneyBRL(n: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n ?? 0));
}

export default function PedidoVendaFormPanel({ vendaId, onSaveSuccess, onClose, mode = 'erp', onFinalizePdv }: Props) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
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
  const canDiscountQuery = useHasPermission('vendas', 'discount');
  const canDiscount = !!canDiscountQuery.data;
  const skuInputRef = useRef<HTMLInputElement>(null);
  const [skuQuery, setSkuQuery] = useState('');
  const [addingSku, setAddingSku] = useState(false);
  const canFinalizePdv = mode === 'pdv' && typeof onFinalizePdv === 'function';

  useEffect(() => {
    if (vendaId) {
      loadDetails();
    }
  }, [vendaId]);

  useEffect(() => {
    if (mode !== 'pdv') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        skuInputRef.current?.focus();
      }
      if (e.key === 'F9' && canFinalizePdv && formData.id) {
        e.preventDefault();
        void handleFinalizePdv();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, canFinalizePdv, formData.id, formData.status, isSaving, addingSku]);

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
    if (!canDiscount && toMoney(formData.desconto) > 0) {
      addToast('Você não tem permissão para aplicar desconto.', 'error');
      return null;
    }
    if (!formData.cliente_id) {
      if (mode === 'pdv') {
        try {
          const clienteId = await ensurePdvDefaultClienteId();
          handleHeaderChange('cliente_id', clienteId);
        } catch (e: any) {
          addToast(e?.message || 'Não foi possível definir o cliente padrão do PDV.', 'error');
          return null;
        }
      } else {
        addToast('Selecione um cliente.', 'error');
        return null;
      }
    }
    const subtotal = toMoney(formData.itens?.reduce((acc, i) => acc + toMoney(i.total), 0) || 0);
    const frete = toMoney(formData.frete);
    const desconto = toMoney(formData.desconto);
    if ((formData.itens?.length || 0) > 0 && desconto > subtotal + frete) {
      addToast('Desconto não pode ser maior que (subtotal + frete).', 'error');
      return null;
    }

    setIsSaving(true);
    try {
      const clienteId = formData.cliente_id || (mode === 'pdv' ? await ensurePdvDefaultClienteId() : null);
      if (!clienteId) {
        addToast('Selecione um cliente.', 'error');
        return null;
      }
      const payload: VendaPayload = {
        id: formData.id,
        cliente_id: clienteId,
        data_emissao: formData.data_emissao,
        data_entrega: formData.data_entrega,
        status: formData.status,
        frete,
        desconto,
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

  const handleAddSku = async () => {
    const sku = skuQuery.trim();
    if (!sku) return;
    setAddingSku(true);
    try {
      const results = await searchItemsForOs(sku, 5, true, 'product');
      const hit = results?.find((r) => r.type === 'product') || results?.[0];
      if (!hit) {
        addToast('SKU não encontrado.', 'warning');
        return;
      }
      await handleAddItem(hit);
      setSkuQuery('');
      skuInputRef.current?.focus();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao adicionar SKU.', 'error');
    } finally {
      setAddingSku(false);
    }
  };

  const handleFinalizePdv = async () => {
    if (!canFinalizePdv || !formData.id) return;
    if ((formData.itens?.length || 0) === 0) {
      addToast('Adicione ao menos 1 item para finalizar.', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Finalizar PDV',
      description: 'Confirmar finalização? Isso gera recebimento e baixa de estoque.',
      confirmText: 'Finalizar',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;

    setIsSaving(true);
    try {
      await onFinalizePdv(formData.id);
      onSaveSuccess();
      onClose();
    } finally {
      setIsSaving(false);
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

    if (field === 'desconto' && !canDiscount) {
      addToast('Você não tem permissão para aplicar desconto.', 'error');
      return;
    }

    const safe = Number.isFinite(value) ? value : 0;
    const updates = {
      quantidade: field === 'quantidade' ? safe : item.quantidade,
      preco_unitario: field === 'preco' ? safe : item.preco_unitario,
      desconto: field === 'desconto' ? safe : item.desconto,
    };

    if (updates.quantidade <= 0) {
      addToast('Quantidade deve ser maior que zero.', 'error');
      return;
    }
    if (updates.preco_unitario < 0) {
      addToast('Preço unitário deve ser >= 0.', 'error');
      return;
    }
    if (updates.desconto < 0) {
      addToast('Desconto deve ser >= 0.', 'error');
      return;
    }

    const maxDesconto = toMoney(updates.quantidade * updates.preco_unitario);
    if (updates.desconto > maxDesconto) {
      updates.desconto = maxDesconto;
      addToast('Desconto do item não pode ser maior que o total do item.', 'warning');
    }

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
    const ok = await confirm({
      title: 'Aprovar pedido',
      description: 'Confirmar aprovação do pedido?',
      confirmText: 'Aprovar',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;
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

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'Cancelar pedido',
      description: 'Cancelar este pedido? Essa ação pode ser revertida apenas reabrindo um novo pedido.',
      confirmText: 'Cancelar pedido',
      cancelText: 'Voltar',
      variant: 'danger',
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      await saveVenda({ id: formData.id!, status: 'cancelado' });
      addToast('Pedido cancelado.', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const isLocked = formData.status !== 'orcamento';
  const subtotal = toMoney(formData.itens?.reduce((acc, i) => acc + toMoney(i.total), 0) || 0);
  const frete = toMoney(formData.frete);
  const desconto = toMoney(formData.desconto);
  const previewTotalGeral = Math.max(0, toMoney(subtotal + frete - desconto));

  const canConcluir = useMemo(() => {
    return !!formData.id && formData.status === 'aprovado';
  }, [formData.id, formData.status]);

  const handleConcluir = async () => {
    if (!formData.id) return;
    const ok = await confirm({
      title: 'Concluir pedido',
      description: 'Concluir o pedido e baixar o estoque? (idempotente)',
      confirmText: 'Concluir',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      await concluirVendaPedido(formData.id);
      await loadDetails();
      addToast('Pedido concluído e estoque baixado.', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao concluir pedido.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

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
            {mode === 'pdv' ? (
              <div className="mt-1 text-xs text-gray-500">
                Opcional no PDV (se vazio, usamos <span className="font-semibold">Consumidor Final</span> automaticamente).
              </div>
            ) : null}
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
              {mode === 'pdv' ? (
                <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 flex items-center gap-3">
                  <div className="flex items-center gap-2 text-gray-700 font-semibold">
                    <ScanBarcode size={18} /> Leitura por SKU
                  </div>
                  <input
                    ref={skuInputRef}
                    value={skuQuery}
                    onChange={(e) => setSkuQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleAddSku();
                      }
                    }}
                    className="flex-1 p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Digite/escaneie o SKU e pressione Enter (F2 foca aqui)"
                    disabled={addingSku}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddSku()}
                    disabled={addingSku || skuQuery.trim().length === 0}
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {addingSku ? 'Adicionando…' : 'Adicionar'}
                  </button>
                </div>
              ) : null}
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
                      <div className="font-medium">{item.produto_nome}</div>
                      {(item.produto_ncm || item.produto_cfop || item.produto_cst || item.produto_csosn) ? (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {item.produto_ncm ? <span>NCM: {item.produto_ncm}</span> : null}
                          {item.produto_cfop ? <span>{item.produto_ncm ? ' · ' : ''}CFOP: {item.produto_cfop}</span> : null}
                          {item.produto_cst ? <span>{(item.produto_ncm || item.produto_cfop) ? ' · ' : ''}CST: {item.produto_cst}</span> : null}
                          {item.produto_csosn ? <span>{(item.produto_ncm || item.produto_cfop || item.produto_cst) ? ' · ' : ''}CSOSN: {item.produto_csosn}</span> : null}
                        </div>
                      ) : null}
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
                        disabled={isLocked || !canDiscount}
                        className="w-full text-right p-1 border rounded text-sm"
                        step="0.01"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold">
                      {formatMoneyBRL(item.total)}
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
              {formatMoneyBRL(subtotal)}
            </div>
          </div>
          <Input label="Frete (R$)" name="frete" {...freteProps} disabled={isLocked} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Input label="Desconto Extra (R$)" name="desconto" {...descontoProps} disabled={isLocked || !canDiscount} />
            {!canDiscount ? (
              <div className="mt-1 text-xs text-amber-700 flex items-center gap-1">
                <ShieldAlert size={14} /> Sem permissão para desconto
              </div>
            ) : null}
          </div>
          
          <div className="sm:col-span-6 flex justify-end mt-4 pt-4 border-t border-gray-100">
            <div className="text-right">
              <div className="text-xs text-gray-500">Prévia</div>
              <div className="text-2xl font-bold text-blue-800">
                Total Geral: {formatMoneyBRL(previewTotalGeral)}
              </div>
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
          {mode !== 'pdv' && canConcluir && (
            <button
              onClick={handleConcluir}
              disabled={isSaving}
              className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <PackageCheck size={20} /> Concluir (baixa estoque)
            </button>
          )}
          {formData.id && formData.status !== 'cancelado' && (
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="flex items-center gap-2 bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <Ban size={20} /> Cancelar
            </button>
          )}
          {formData.id && !isLocked && (
            <button 
              onClick={handleAprovar} 
              disabled={isSaving || (formData.itens?.length || 0) === 0}
              className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle size={20} /> Aprovar Venda
            </button>
          )}
          {canFinalizePdv && !isLocked && formData.id && (
            <button
              onClick={() => void handleFinalizePdv()}
              disabled={isSaving || (formData.itens?.length || 0) === 0}
              className="flex items-center gap-2 bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              title="Atalho: F9"
            >
              <PackageCheck size={20} /> Finalizar PDV
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
