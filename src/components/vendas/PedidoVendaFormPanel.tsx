import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Loader2, Save, ShieldAlert, Trash2, Ban, PackageCheck, ScanBarcode } from 'lucide-react';
import { VendaDetails, VendaPayload, saveVenda, manageVendaItem, fetchVendaDetails, getVendaDetails, aprovarVenda, concluirVendaPedido } from '@/services/vendas';
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
import { listVendedores, type Vendedor } from '@/services/vendedores';
import { listMarketplaceOrderTimeline, type MarketplaceTimelineEvent } from '@/services/ecommerceOrders';
import { listAuditLogsForTables, type AuditLogRow } from '@/services/auditLogs';

interface Props {
  vendaId: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
  mode?: 'erp' | 'pdv';
  onFinalizePdv?: (pedidoId: string) => Promise<void>;
}

type DiscountAuditRow = {
  scope: 'pedido' | 'item';
  itemLabel?: string;
  field: 'desconto' | 'preco_unitario';
  from: number;
  to: number;
  changedAt: string;
  changedBy: string | null;
};

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
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [formData, setFormData] = useState<Partial<VendaDetails>>({
    status: 'orcamento',
    data_emissao: new Date().toISOString().split('T')[0],
    frete: 0,
    desconto: 0,
    vendedor_id: null,
    comissao_percent: 0,
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
  const [marketplaceTimeline, setMarketplaceTimeline] = useState<MarketplaceTimelineEvent[]>([]);
  const [loadingMarketplaceTimeline, setLoadingMarketplaceTimeline] = useState(false);
  const [discountAudit, setDiscountAudit] = useState<DiscountAuditRow[]>([]);
  const [loadingDiscountAudit, setLoadingDiscountAudit] = useState(false);

  useEffect(() => {
    if (!vendaId) return;
    void loadDetails({ id: vendaId, closeOnError: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendaId]);

  useEffect(() => {
    // COM-01: vendedores para comissões (opcional)
    void (async () => {
      try {
        const data = await listVendedores(undefined, true);
        setVendedores(data);
      } catch {
        setVendedores([]);
      }
    })();
  }, []);

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

  const loadDetails = async (params?: { id?: string | null; closeOnError?: boolean; silent?: boolean }) => {
    const targetId = params?.id ?? vendaId ?? formData.id ?? null;
    if (!targetId) return false;

    try {
      if (!params?.silent) setLoading(true);

      const data = await fetchVendaDetails(targetId);
      if (!data) {
        addToast('Pedido não encontrado (ou sem acesso).', 'error');
        if (params?.closeOnError) onClose();
        return false;
      }
      setFormData(data);

      const canal = (data as any)?.canal;
      if (canal === 'marketplace' && data?.id) {
        setLoadingMarketplaceTimeline(true);
        try {
          const ev = await listMarketplaceOrderTimeline(data.id);
          setMarketplaceTimeline(ev ?? []);
        } catch {
          setMarketplaceTimeline([]);
        } finally {
          setLoadingMarketplaceTimeline(false);
        }
      } else {
        setMarketplaceTimeline([]);
      }
    } catch (e) {
      console.error(e);
      addToast('Erro ao carregar pedido.', 'error');
      if (params?.closeOnError) onClose();
      return false;
    } finally {
      if (!params?.silent) setLoading(false);
    }
    return true;
  };

  const buildDiscountAudit = (rows: AuditLogRow[], pedidoId: string, items: any[]): DiscountAuditRow[] => {
    const itemById = new Map<string, any>();
    items.forEach((i) => {
      if (i?.id) itemById.set(i.id, i);
    });

    const out: DiscountAuditRow[] = [];

    for (const r of rows) {
      if (r.operation !== 'UPDATE') continue;
      if (!r.record_id) continue;

      const oldData = r.old_data || {};
      const newData = r.new_data || {};

      const pushIfChanged = (
        scope: DiscountAuditRow['scope'],
        field: DiscountAuditRow['field'],
        fromRaw: unknown,
        toRaw: unknown,
        itemLabel?: string
      ) => {
        const from = Number(fromRaw ?? 0);
        const to = Number(toRaw ?? 0);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return;
        if (from === to) return;
        out.push({
          scope,
          field,
          from,
          to,
          itemLabel,
          changedAt: r.changed_at,
          changedBy: r.changed_by,
        });
      };

      if (r.table_name === 'vendas_pedidos' && r.record_id === pedidoId) {
        pushIfChanged('pedido', 'desconto', (oldData as any).desconto, (newData as any).desconto);
      }

      if (r.table_name === 'vendas_itens_pedido') {
        const item = itemById.get(r.record_id);
        if (!item) continue;
        const label = item?.produto_nome ? String(item.produto_nome) : 'Item';
        pushIfChanged('item', 'preco_unitario', (oldData as any).preco_unitario, (newData as any).preco_unitario, label);
        pushIfChanged('item', 'desconto', (oldData as any).desconto, (newData as any).desconto, label);
      }
    }

    return out.sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1)).slice(0, 50);
  };

  const loadDiscountAudit = async (pedidoId: string) => {
    setLoadingDiscountAudit(true);
    try {
      const rows = await listAuditLogsForTables(['vendas_pedidos', 'vendas_itens_pedido'], 300);
      const items = (formData as any)?.itens || [];
      setDiscountAudit(buildDiscountAudit(rows, pedidoId, items));
    } catch {
      setDiscountAudit([]);
    } finally {
      setLoadingDiscountAudit(false);
    }
  };

  useEffect(() => {
    if (!formData.id) {
      setDiscountAudit([]);
      return;
    }
    void loadDiscountAudit(formData.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.id, (formData.itens || []).length]);

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
      const comissaoPercent = Math.max(0, Math.min(100, Number(formData.comissao_percent ?? 0) || 0));
      const payload: VendaPayload = {
        id: formData.id,
        cliente_id: clienteId,
        vendedor_id: formData.vendedor_id || null,
        comissao_percent: comissaoPercent,
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

      const canal = (saved as any)?.canal ?? (formData as any)?.canal;
      if (canal === 'marketplace' && saved?.id) {
        try {
          const ev = await listMarketplaceOrderTimeline(saved.id);
          setMarketplaceTimeline(ev ?? []);
        } catch {
          setMarketplaceTimeline([]);
        }
      }
      
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
      const refreshed = await loadDetails({ id: currentId, silent: true });
      if (!refreshed) {
        const preco = toMoney(item.preco_venda || 0);
        const optimisticItem: any = {
          id: `tmp-${Date.now()}`,
          pedido_id: currentId,
          produto_id: item.id,
          produto_nome: item.descricao || item.nome || 'Produto',
          quantidade: 1,
          preco_unitario: preco,
          desconto: 0,
          total: preco,
        };
        setFormData((prev) => ({
          ...(prev || {}),
          id: currentId,
          itens: [...(prev.itens || []), optimisticItem],
        }));
      }
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

  const handleRemoveItem = async (itemId: string, produtoId?: string | null) => {
    try {
      await manageVendaItem(formData.id!, itemId, produtoId ?? null, 0, 0, 0, 'remove');
      await loadDetails({ id: formData.id, silent: true });
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
	      if (!formData.id) {
	        addToast('Pedido inválido.', 'error');
	        return;
	      }

	      let clienteId = formData.cliente_id ?? null;
	      if (!clienteId) {
	        try {
	          const details = await getVendaDetails(formData.id);
	          clienteId = details?.cliente_id ?? null;
	        } catch {
	          clienteId = null;
	        }
	      }
	      if (!clienteId) {
	        addToast('Cliente é obrigatório para cancelar o pedido.', 'error');
	        return;
	      }

	      const payload: VendaPayload = {
	        id: formData.id,
	        cliente_id: clienteId,
	        status: 'cancelado',
	        data_emissao: formData.data_emissao ?? new Date().toISOString().split('T')[0],
	        data_entrega: formData.data_entrega ?? null,
	        frete: toMoney(formData.frete),
	        desconto: toMoney(formData.desconto),
	        condicao_pagamento: formData.condicao_pagamento ?? null,
	        observacoes: formData.observacoes ?? null,
	        vendedor_id: formData.vendedor_id ?? null,
	        comissao_percent: Math.max(0, Math.min(100, Number(formData.comissao_percent ?? 0) || 0)),
	      };

	      await saveVenda(payload);
	      addToast('Pedido cancelado.', 'success');
	      onSaveSuccess();
	    } catch (e: any) {
	      addToast(e.message, 'error');
	    } finally {
	      setIsSaving(false);
	    }
	  };

  const isLocked = formData.status !== 'orcamento';
  const isMarketplaceOrder = (formData as any)?.canal === 'marketplace';
  const subtotal = toMoney(formData.itens?.reduce((acc, i) => acc + toMoney(i.total), 0) || 0);
  const frete = toMoney(formData.frete);
  const desconto = toMoney(formData.desconto);
  const previewTotalGeral = Math.max(0, toMoney(subtotal + frete - desconto));

  const canConcluir = useMemo(() => {
    return !!formData.id && formData.status === 'aprovado';
  }, [formData.id, formData.status]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

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

        {isMarketplaceOrder && (
          <Section title="Marketplace" description="Histórico e eventos da integração">
            {loadingMarketplaceTimeline ? (
              <div className="text-sm text-gray-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando timeline…
              </div>
            ) : marketplaceTimeline.length === 0 ? (
              <div className="text-sm text-gray-600">Sem eventos registrados para este pedido.</div>
            ) : (
              <div className="overflow-x-auto border rounded-lg bg-white">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Quando</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Tipo</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Mensagem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {marketplaceTimeline.map((e, idx) => (
                      <tr key={`${e.kind}-${e.occurred_at}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{new Date(e.occurred_at).toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{e.kind}</td>
                        <td className="px-3 py-2 text-sm text-gray-800">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
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
            <label htmlFor="vendas_vendedor_id" className="block text-sm font-medium text-gray-700 mb-1">
              Vendedor (opcional)
            </label>
            <select
              id="vendas_vendedor_id"
              value={formData.vendedor_id || ''}
              onChange={(e) => {
                const id = e.target.value || null;
                const v = vendedores.find((x) => x.id === id);
                handleHeaderChange('vendedor_id', id);
                if (v) handleHeaderChange('comissao_percent', Number(v.comissao_percent || 0));
              }}
              className="w-full p-3 border border-gray-300 rounded-lg"
              disabled={isLocked}
            >
              <option value="">—</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Comissão (%)"
              type="number"
              value={String(formData.comissao_percent ?? 0)}
              onChange={(e) => handleHeaderChange('comissao_percent', e.target.value)}
              disabled={isLocked}
              placeholder="0"
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
                          className="w-full text-right p-1 border rounded text-sm pl-8"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-xs text-gray-500">R$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.desconto || 0)}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '');
                            const numberValue = digits ? parseInt(digits, 10) / 100 : 0;
                            handleUpdateItem(item.id, 'desconto', numberValue);
                          }}
                          disabled={isLocked || !canDiscount}
                          className="w-full text-right p-1 border rounded text-sm pl-8"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold">
                      {formatMoneyBRL(item.total)}
                    </td>
                    {!isLocked && (
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleRemoveItem(item.id, item.produto_id)}
                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                        >
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
          <Input label="Frete" name="frete" startAdornment="R$" inputMode="numeric" {...freteProps} disabled={isLocked} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Input label="Desconto Extra" name="desconto" startAdornment="R$" inputMode="numeric" {...descontoProps} disabled={isLocked || !canDiscount} />
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

        <Section title="Auditoria de preço/desconto" description="Quem alterou preço/desconto e quando.">
          {loadingDiscountAudit ? (
            <div className="text-sm text-gray-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando auditoria…
            </div>
          ) : discountAudit.length === 0 ? (
            <div className="text-sm text-gray-600">Sem alterações registradas para preço/desconto.</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Quando</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Onde</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Campo</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">De</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Para</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Quem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {discountAudit.map((e, idx) => (
                    <tr key={`${e.changedAt}-${e.field}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
                        {new Date(e.changedAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800">
                        {e.scope === 'pedido' ? 'Pedido' : e.itemLabel || 'Item'}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
                        {e.field === 'preco_unitario' ? 'Preço unit.' : 'Desconto'}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800 text-right whitespace-nowrap">
                        {formatMoneyBRL(e.from)}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-900 text-right font-semibold whitespace-nowrap">
                        {formatMoneyBRL(e.to)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {e.changedBy ? `${e.changedBy.slice(0, 8)}…` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
