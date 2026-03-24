import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Loader2, Save, ShieldAlert, Trash2, Ban, PackageCheck, FileText, Wallet, Printer, ChevronDown } from 'lucide-react';
import { VendaDetails, VendaPayload, saveVenda, manageVendaItem, fetchVendaDetails, getVendaDetails, aprovarVenda, concluirVendaPedido } from '@/services/vendas';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';
import SearchFirstSelect from '@/components/common/SearchFirstSelect';
import SideSheet from '@/components/ui/SideSheet';
import { useNumericField } from '@/hooks/useNumericField';
import { useHasPermission } from '@/hooks/useHasPermission';
import { searchItemsForOs } from '@/services/os';
import { listVendedores, type Vendedor } from '@/services/vendedores';
import { listMarketplaceOrderTimeline, type MarketplaceTimelineEvent } from '@/services/ecommerceOrders';
import { listAuditLogsForTables, type AuditLogRow } from '@/services/auditLogs';
import { useNavigate } from 'react-router-dom';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import ParcelamentoDialog from '@/components/financeiro/parcelamento/ParcelamentoDialog';
import { createParcelamentoFromVenda } from '@/services/financeiroParcelamento';
import MeioPagamentoDropdown from '@/components/common/MeioPagamentoDropdown';
import { getUnitPrice, listTabelasPreco, type TabelaPrecoRow } from '@/services/pricing';
import { searchCondicoesPagamento, type CondicaoPagamento } from '@/services/condicoesPagamento';
import PartnerFormPanel from '@/components/partners/PartnerFormPanel';
import ProductFormPanel, { type ProductFormData } from '@/components/products/ProductFormPanel';
import { searchClients } from '@/services/clients';
import { saveProduct } from '@/services/products';
import { useAuth } from '@/contexts/AuthProvider';
import { failOperation, startOperation, succeedOperation } from '@/lib/operationTelemetry';
import { fiscalNfeGerarDePedido } from '@/services/fiscalNfeEmissoes';
import { printPedido, type PrintPedidoMode } from '@/lib/vendas/printPedido';
import { getPartnerDetails } from '@/services/partners';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSupabase } from '@/providers/SupabaseProvider';

interface Props {
  vendaId: string | null;
  onSaveSuccess: (opts?: { keepOpen?: boolean }) => void;
  onClose: () => void;
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

export default function PedidoVendaFormPanel({ vendaId, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const { loading: authLoading, activeEmpresaId, activeEmpresa } = useAuth();
  const supabase = useSupabase();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!!vendaId);
  const [isSaving, setIsSaving] = useState(false);
  const [condicoesPagamento, setCondicoesPagamento] = useState<CondicaoPagamento[]>([]);
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

  const isLocked = formData.status !== 'orcamento';
  const freteProps = useNumericField(formData.frete, (v) => handleHeaderChange('frete', v));
  const descontoProps = useNumericField(formData.desconto, (v) => handleHeaderChange('desconto', v));
  const comissaoProps = useNumericField(formData.comissao_percent, (v) => {
    if (v === null) {
      handleHeaderChange('comissao_percent', null);
      return;
    }
    const clamped = Math.max(0, Math.min(100, Number(v) || 0));
    handleHeaderChange('comissao_percent', clamped);
  });
  const canDiscountQuery = useHasPermission('vendas', 'discount');
  const canDiscount = !!canDiscountQuery.data;
  const [isQuickCreatePartnerOpen, setIsQuickCreatePartnerOpen] = useState(false);
  const [quickCreatePartnerDraft, setQuickCreatePartnerDraft] = useState<{ q: string } | null>(null);
  const [isQuickCreateProductOpen, setIsQuickCreateProductOpen] = useState(false);
  const [quickCreateProductDraft, setQuickCreateProductDraft] = useState<{ q: string } | null>(null);
  const [marketplaceTimeline, setMarketplaceTimeline] = useState<MarketplaceTimelineEvent[]>([]);
  const [loadingMarketplaceTimeline, setLoadingMarketplaceTimeline] = useState(false);
  const [discountAudit, setDiscountAudit] = useState<DiscountAuditRow[]>([]);
  const [loadingDiscountAudit, setLoadingDiscountAudit] = useState(false);
  const [tabelasPreco, setTabelasPreco] = useState<TabelaPrecoRow[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const actionTokenRef = useRef(0);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;
    actionTokenRef.current += 1;
    setIsSaving(false);
    setLoading(false);
    setLoadingMarketplaceTimeline(false);
    setLoadingDiscountAudit(false);
    setMarketplaceTimeline([]);
    setDiscountAudit([]);
    setCondicoesPagamento([]);
    setVendedores([]);
    setTabelasPreco([]);
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  // Fetch logo signed URL for print
  useEffect(() => {
    if (!activeEmpresa?.logotipo_url) { setLogoUrl(null); return; }
    supabase.storage.from('company_logos')
      .createSignedUrl(activeEmpresa.logotipo_url, 3600)
      .then(({ data }) => setLogoUrl(data?.signedUrl ?? null))
      .catch(() => setLogoUrl(null));
  }, [activeEmpresa?.logotipo_url, supabase]);

  useEffect(() => {
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    let alive = true;
    const empresaSnapshot = activeEmpresaId;
    (async () => {
      try {
        const rows = await searchCondicoesPagamento({ tipo: 'ambos', q: null, limit: 50 });
        if (!alive || empresaSnapshot !== lastEmpresaIdRef.current) return;
        setCondicoesPagamento(rows ?? []);
      } catch {
        if (!alive || empresaSnapshot !== lastEmpresaIdRef.current) return;
        setCondicoesPagamento([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeEmpresaId, authLoading, empresaChanged]);
  const manualPriceItemIdsRef = useRef<Set<string>>(new Set());
  const [qtyUnitMode, setQtyUnitMode] = useState<Record<string, 'base' | 'g'>>({});
  const [marketplaceTimelineSort, setMarketplaceTimelineSort] = useState<SortState<string>>({
    column: 'quando',
    direction: 'desc',
  });
  const [discountAuditSort, setDiscountAuditSort] = useState<SortState<string>>({
    column: 'quando',
    direction: 'desc',
  });

  const marketplaceTimelineColumns: TableColumnWidthDef[] = [
    { id: 'quando', defaultWidth: 220, minWidth: 200 },
    { id: 'tipo', defaultWidth: 220, minWidth: 160 },
    { id: 'mensagem', defaultWidth: 640, minWidth: 260 },
  ];
  const { widths: marketplaceTimelineWidths, startResize: startMarketplaceTimelineResize } = useTableColumnWidths({
    tableId: 'vendas:pedido:marketplace-timeline',
    columns: marketplaceTimelineColumns,
  });
  const sortedMarketplaceTimeline = useMemo(() => {
    return sortRows(
      marketplaceTimeline,
      marketplaceTimelineSort as any,
      [
        { id: 'quando', type: 'date', getValue: (r) => r.occurred_at },
        { id: 'tipo', type: 'string', getValue: (r) => r.kind ?? '' },
        { id: 'mensagem', type: 'string', getValue: (r) => r.message ?? '' },
      ] as const
    );
  }, [marketplaceTimeline, marketplaceTimelineSort]);

  const itensTableColumns = useMemo<TableColumnWidthDef[]>(() => {
    const cols: TableColumnWidthDef[] = [
      { id: 'produto', defaultWidth: 520, minWidth: 260 },
      { id: 'qtd', defaultWidth: 120, minWidth: 90 },
      { id: 'preco_unit', defaultWidth: 160, minWidth: 120 },
      { id: 'desc', defaultWidth: 140, minWidth: 120 },
      { id: 'total', defaultWidth: 160, minWidth: 120 },
    ];
    if (!isLocked) cols.push({ id: 'acoes', defaultWidth: 56, minWidth: 44 });
    return cols;
  }, [isLocked]);
  const { widths: itensTableWidths, startResize: startItensResize } = useTableColumnWidths({
    tableId: 'vendas:pedido:itens',
    columns: itensTableColumns,
  });

  const discountAuditColumns: TableColumnWidthDef[] = [
    { id: 'quando', defaultWidth: 220, minWidth: 200 },
    { id: 'onde', defaultWidth: 220, minWidth: 160 },
    { id: 'campo', defaultWidth: 160, minWidth: 120 },
    { id: 'de', defaultWidth: 140, minWidth: 120 },
    { id: 'para', defaultWidth: 140, minWidth: 120 },
    { id: 'quem', defaultWidth: 160, minWidth: 120 },
  ];
  const { widths: discountAuditWidths, startResize: startDiscountAuditResize } = useTableColumnWidths({
    tableId: 'vendas:pedido:discount-audit',
    columns: discountAuditColumns,
  });
  const sortedDiscountAudit = useMemo(() => {
    return sortRows(
      discountAudit,
      discountAuditSort as any,
      [
        { id: 'quando', type: 'date', getValue: (r) => r.changedAt },
        { id: 'onde', type: 'string', getValue: (r) => (r.scope === 'pedido' ? 'Pedido' : r.itemLabel || 'Item') },
        { id: 'campo', type: 'string', getValue: (r) => (r.field === 'preco_unitario' ? 'Preço unit.' : 'Desconto') },
        { id: 'de', type: 'number', getValue: (r) => r.from },
        { id: 'para', type: 'number', getValue: (r) => r.to },
        { id: 'quem', type: 'string', getValue: (r) => r.changedBy ?? '' },
      ] as const
    );
  }, [discountAudit, discountAuditSort]);

  useEffect(() => {
    if (!vendaId) return;
    if (empresaChanged) return;
    void loadDetails({ id: vendaId, closeOnError: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresaId, authLoading, empresaChanged, vendaId]);

  useEffect(() => {
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    let alive = true;
    const empresaSnapshot = activeEmpresaId;
    (async () => {
      try {
        const rows = await listTabelasPreco();
        if (!alive || empresaSnapshot !== lastEmpresaIdRef.current) return;
        setTabelasPreco(rows ?? []);
      } catch {
        if (!alive || empresaSnapshot !== lastEmpresaIdRef.current) return;
        setTabelasPreco([]);
      }
    })();
    return () => { alive = false; };
  }, [activeEmpresaId, authLoading, empresaChanged]);

  useEffect(() => {
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    let alive = true;
    const empresaSnapshot = activeEmpresaId;
    // COM-01: vendedores para comissões (opcional)
    (async () => {
      try {
        const data = await listVendedores(undefined, true);
        if (!alive || empresaSnapshot !== lastEmpresaIdRef.current) return;
        setVendedores(data);
      } catch {
        if (!alive || empresaSnapshot !== lastEmpresaIdRef.current) return;
        setVendedores([]);
      }
    })();
    return () => { alive = false; };
  }, [activeEmpresaId, authLoading, empresaChanged]);

  const loadDetails = async (params?: { id?: string | null; closeOnError?: boolean; silent?: boolean }) => {
    if (empresaChanged) return false;
    const empresaSnapshot = activeEmpresaId ?? null;
    const targetId = params?.id ?? vendaId ?? formData.id ?? null;
    if (!targetId) return false;

    try {
      if (!params?.silent) setLoading(true);

      const data = await fetchVendaDetails(targetId);
      if (empresaSnapshot !== lastEmpresaIdRef.current) return false;
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
          if (empresaSnapshot !== lastEmpresaIdRef.current) return false;
          setMarketplaceTimeline(ev ?? []);
        } catch {
          if (empresaSnapshot !== lastEmpresaIdRef.current) return false;
          setMarketplaceTimeline([]);
        } finally {
          if (empresaSnapshot !== lastEmpresaIdRef.current) return false;
          setLoadingMarketplaceTimeline(false);
        }
      } else {
        setMarketplaceTimeline([]);
      }
    } catch (e) {
      if (empresaSnapshot !== lastEmpresaIdRef.current) return false;
      console.error(e);
      addToast('Erro ao carregar pedido.', 'error');
      if (params?.closeOnError) onClose();
      return false;
    } finally {
      if (empresaSnapshot !== lastEmpresaIdRef.current) return false;
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
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setLoadingDiscountAudit(true);
    try {
      const rows = await listAuditLogsForTables(['vendas_pedidos', 'vendas_itens_pedido'], 300);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      const items = (formData as any)?.itens || [];
      setDiscountAudit(buildDiscountAudit(rows, pedidoId, items));
    } catch {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setDiscountAudit([]);
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
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

  const handleHeaderChange = (field: keyof VendaPayload | 'cliente_nome', value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePrint = async (mode: PrintPedidoMode) => {
    if (!formData.id) return;
    const emp = activeEmpresa;
    const endParts = [
      emp?.endereco_logradouro,
      emp?.endereco_numero ? `, ${emp.endereco_numero}` : '',
      emp?.endereco_complemento ? ` — ${emp.endereco_complemento}` : '',
      emp?.endereco_bairro ? ` — ${emp.endereco_bairro}` : '',
      emp?.endereco_cidade ? ` — ${emp.endereco_cidade}` : '',
      emp?.endereco_uf ? `/${emp.endereco_uf}` : '',
      emp?.endereco_cep ? ` — CEP ${emp.endereco_cep}` : '',
    ];
    const empresaEndereco = emp?.endereco_logradouro ? endParts.join('') : null;

    let clientPrintDetails: { nome: string; doc: string | null; telefone: string | null; email: string | null; endereco: string | null } | null = null;
    if (formData.cliente_id) {
      try {
        const partner = await getPartnerDetails(formData.cliente_id);
        if (partner) {
          const addr = partner.enderecos?.[0];
          const clienteEndereco = addr?.logradouro
            ? [addr.logradouro, addr.numero ? `, ${addr.numero}` : '', addr.complemento ? ` — ${addr.complemento}` : '', addr.bairro ? ` — ${addr.bairro}` : '', addr.cidade ? ` — ${addr.cidade}` : '', addr.uf ? `/${addr.uf}` : '', addr.cep ? ` — CEP ${addr.cep}` : ''].join('')
            : null;
          clientPrintDetails = {
            nome: partner.nome,
            doc: partner.doc_unico ?? null,
            telefone: partner.telefone || (partner as any).celular || null,
            email: partner.email ?? null,
            endereco: clienteEndereco,
          };
        }
      } catch { /* print without client details */ }
    }

    printPedido({
      pedido: formData as VendaDetails,
      mode,
      empresa: {
        nome: emp?.nome_fantasia || emp?.nome_razao_social || '',
        cnpj: emp?.cnpj ?? null,
        telefone: emp?.telefone ?? null,
        email: emp?.email ?? null,
        endereco: empresaEndereco,
      },
      logoUrl,
      clientDetails: clientPrintDetails,
    });
  };

  const handleSaveHeader = async () => {
    if (authLoading || !activeEmpresaId || empresaChanged) {
      addToast('Aguarde a troca de empresa concluir para salvar.', 'info');
      return null;
    }
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    if (!canDiscount && toMoney(formData.desconto) > 0) {
      addToast('Você não tem permissão para aplicar desconto.', 'error');
      return null;
    }
    if (!formData.cliente_id) {
      addToast('Selecione um cliente.', 'error');
      return null;
    }
    const subtotal = toMoney(formData.itens?.reduce((acc, i) => acc + toMoney(i.total), 0) || 0);
    const frete = toMoney(formData.frete);
    const desconto = toMoney(formData.desconto);
    if ((formData.itens?.length || 0) > 0 && desconto > subtotal + frete) {
      addToast('Desconto não pode ser maior que (subtotal + frete).', 'error');
      return null;
    }

    setIsSaving(true);
    const saveSession = startOperation({
      domain: 'vendas_pedido',
      action: formData.id ? 'atualizar_cabecalho' : 'criar_cabecalho',
      tenantId: activeEmpresaId,
      entityId: formData.id ?? null,
    });
    try {
      const clienteId = formData.cliente_id;
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
        observacoes: formData.observacoes,
        tabela_preco_id: (formData as any)?.tabela_preco_id ?? null,
      };
      const saved = await saveVenda(payload);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return null;
      setFormData(prev => ({ ...prev, ...saved }));

      const canal = (saved as any)?.canal ?? (formData as any)?.canal;
      if (canal === 'marketplace' && saved?.id) {
        try {
          const ev = await listMarketplaceOrderTimeline(saved.id);
          if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return null;
          setMarketplaceTimeline(ev ?? []);
        } catch {
          if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return null;
          setMarketplaceTimeline([]);
        }
      }
      
      if (!formData.id) {
        addToast('Pedido criado! Agora adicione os itens.', 'success');
      } else {
        addToast('Pedido salvo.', 'success');
      }
      onSaveSuccess({ keepOpen: !formData.id });
      succeedOperation(saveSession, { pedido_id: saved.id, status: saved.status ?? null });
      return saved.id;
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return null;
      failOperation(
        saveSession,
        e,
        { pedido_id: formData.id ?? null, status: formData.status ?? null },
        '[VENDAS][PEDIDO][SAVE][ERROR]'
      );
      addToast(e.message, 'error');
      return null;
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return null;
      setIsSaving(false);
    }
  };

  const handleAddItem = async (item: any) => {
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    const empresaSnapshot = activeEmpresaId;
    if (item.type !== 'product') {
        addToast('Apenas produtos podem ser adicionados a pedidos de venda.', 'warning');
        return;
    }

    let currentId = formData.id;
    if (!currentId) {
      const savedId = await handleSaveHeader();
      if (!savedId) return;
      currentId = savedId;
    }

    try {
      const pricing = await getUnitPrice({
        produtoId: item.id,
        quantidade: 1,
        tabelaPrecoId: (formData as any)?.tabela_preco_id ?? null,
        fallbackPrecoUnitario: item.preco_venda ?? 0,
      });
      const precoUnit = Number(pricing.preco_unitario ?? item.preco_venda ?? 0);
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      await manageVendaItem(currentId!, null, item.id, 1, precoUnit, 0, 'add');
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      const refreshed = await loadDetails({ id: currentId, silent: true });
      if (!refreshed) {
        const preco = toMoney(precoUnit);
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
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(e.message, 'error');
    }
  };

  const handleRemoveItem = async (itemId: string, produtoId?: string | null) => {
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    try {
      await manageVendaItem(formData.id!, itemId, produtoId ?? null, 0, 0, 0, 'remove');
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      await loadDetails({ id: formData.id, silent: true });
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Item removido.', 'success');
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(e.message, 'error');
    }
  };

	  const handleUpdateItem = async (itemId: string, field: string, value: number) => {
      if (authLoading || !activeEmpresaId || empresaChanged) return;
      const token = ++actionTokenRef.current;
      const empresaSnapshot = activeEmpresaId;
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

	    if (field === 'preco') {
	      manualPriceItemIdsRef.current.add(itemId);
	    }

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
	      if (field === 'quantidade' && !manualPriceItemIdsRef.current.has(itemId) && (updates.desconto || 0) === 0) {
	        const pricing = await getUnitPrice({
	          produtoId: item.produto_id,
	          quantidade: updates.quantidade,
	          tabelaPrecoId: (formData as any)?.tabela_preco_id ?? null,
	        });
	        updates.preco_unitario = Number(pricing.preco_unitario ?? updates.preco_unitario);
	      }
	      await manageVendaItem(formData.id!, itemId, item.produto_id, updates.quantidade, updates.preco_unitario, updates.desconto, 'update');
          if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
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
          if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
	      addToast(e.message, 'error');
	    }
	  };

  const handleAprovar = async () => {
    if (empresaChanged) return;
    const ok = await confirm({
      title: 'Aprovar pedido',
      description: 'Confirmar aprovação do pedido?',
      confirmText: 'Aprovar',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;
    let pedidoId: string | undefined = formData.id ?? undefined;
    if (!pedidoId) {
      const createdId = await handleSaveHeader();
      if (!createdId) return;
      pedidoId = createdId;
    }
    const empresaSnapshot = activeEmpresaId ?? null;
    setIsSaving(true);
    try {
      await aprovarVenda(pedidoId);
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Pedido aprovado com sucesso!', 'success');
      await loadDetails({ id: pedidoId, silent: true });
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      onSaveSuccess({ keepOpen: true });
    } catch (e: any) {
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      try {
        const latest = await fetchVendaDetails(pedidoId);
        if (latest?.status === 'aprovado' || latest?.status === 'concluido') {
          addToast('Pedido aprovado com sucesso!', 'success');
          onSaveSuccess({ keepOpen: true });
          return;
        }
      } catch {
        // no-op: keeps original error handling below
      }
      addToast(e.message, 'error');
    } finally {
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
      if (authLoading || !activeEmpresaId || empresaChanged) return;
	    const ok = await confirm({
	      title: 'Cancelar pedido',
	      description: 'Cancelar este pedido? Essa ação pode ser revertida apenas reabrindo um novo pedido.',
	      confirmText: 'Cancelar pedido',
	      cancelText: 'Voltar',
	      variant: 'danger',
	    });
	    if (!ok) return;
      const token = ++actionTokenRef.current;
      const empresaSnapshot = activeEmpresaId;
      const cancelSession = startOperation({
        domain: 'vendas_pedido',
        action: 'cancelar',
        tenantId: activeEmpresaId,
        entityId: formData.id ?? null,
      });
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
		        tabela_preco_id: (formData as any)?.tabela_preco_id ?? null,
		      };

	      await saveVenda(payload);
          if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
          succeedOperation(cancelSession, { pedido_id: formData.id, status: 'cancelado' });
	      addToast('Pedido cancelado.', 'success');
	      onSaveSuccess();
	    } catch (e: any) {
          if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
          failOperation(cancelSession, e, { pedido_id: formData.id ?? null }, '[VENDAS][PEDIDO][CANCEL][ERROR]');
	      addToast(e.message, 'error');
	    } finally {
          if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
	      setIsSaving(false);
	    }
		  };
  const isMarketplaceOrder = (formData as any)?.canal === 'marketplace';
  const subtotal = toMoney(formData.itens?.reduce((acc, i) => acc + toMoney(i.total), 0) || 0);
  const frete = toMoney(formData.frete);
  const desconto = toMoney(formData.desconto);
  const previewTotalGeral = Math.max(0, toMoney(subtotal + frete - desconto));
  const [parcelamentoOpen, setParcelamentoOpen] = useState(false);

  const canConcluir = useMemo(() => {
    return !!formData.id && formData.status === 'aprovado';
  }, [formData.id, formData.status]);

  const canGerarNfe = useMemo(() => {
    return !!formData.id && ['aprovado', 'concluido'].includes(formData.status ?? '');
  }, [formData.id, formData.status]);

  const [gerandoNfe, setGerandoNfe] = useState(false);

  const handleGerarNfeFromForm = async () => {
    if (!formData.id) return;
    const ok = await confirm({
      title: 'Gerar NF-e',
      description: `Deseja gerar uma Nota Fiscal Eletrônica para o pedido #${formData.numero}?`,
      confirmText: 'Gerar NF-e',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;
    setGerandoNfe(true);
    try {
      const emissaoId = await fiscalNfeGerarDePedido(formData.id);
      addToast('NF-e criada com sucesso! Redirecionando...', 'success');
      navigate(`/app/fiscal/nfe?open=${encodeURIComponent(emissaoId)}`);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao gerar NF-e.', 'error');
    } finally {
      setGerandoNfe(false);
    }
  };

  const showLoadingBanner = loading;

  const handleConcluir = async () => {
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    if (!formData.id) return;
    const ok = await confirm({
      title: 'Concluir pedido',
      description: 'Concluir o pedido e baixar o estoque? (idempotente)',
      confirmText: 'Concluir',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    const concludeSession = startOperation({
      domain: 'vendas_pedido',
      action: 'concluir',
      tenantId: activeEmpresaId,
      entityId: formData.id,
    });
    setIsSaving(true);
    try {
      await concluirVendaPedido(formData.id);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      await loadDetails();
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Pedido concluído e estoque baixado.', 'success');
      onSaveSuccess({ keepOpen: true });
      succeedOperation(concludeSession, { pedido_id: formData.id, status: 'concluido' });

	      const wantTitles = await confirm({
	        title: 'Gerar títulos (contas a receber)',
	        description: 'Deseja gerar automaticamente os títulos (parcelas) de Contas a Receber para este pedido?',
	        confirmText: 'Gerar agora',
	        cancelText: 'Agora não',
	        variant: 'primary',
	      });
      if (wantTitles) {
        setParcelamentoOpen(true);
      }
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      failOperation(concludeSession, e, { pedido_id: formData.id }, '[VENDAS][PEDIDO][CONCLUIR][ERROR]');
      addToast(e?.message || 'Falha ao concluir pedido.', 'error');
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setIsSaving(false);
    }
  };

  const openQuickCreatePartner = (draft: { q: string }) => {
    setQuickCreatePartnerDraft(draft);
    setIsQuickCreatePartnerOpen(true);
  };

  const openQuickCreateProduct = (draft: { q: string }) => {
    setQuickCreateProductDraft(draft);
    setIsQuickCreateProductOpen(true);
  };

  const digitsOnly = (s: string) => String(s || '').replace(/\D/g, '');

  const quickCreatePartnerInitialValues = (() => {
    const q = quickCreatePartnerDraft?.q || '';
    const digits = digitsOnly(q);
    const isDoc = digits.length === 11 || digits.length === 14;
    return isDoc ? ({ tipo: 'cliente', doc_unico: digits } as any) : ({ tipo: 'cliente', nome: q } as any);
  })();

  const quickCreateProductInitialValues: Partial<ProductFormData> = (() => {
    const q = quickCreateProductDraft?.q || '';
    return { nome: q, pode_vender: true, permitir_inclusao_vendas: true };
  })();

  const handlePartnerQuickCreateSuccess = (savedPartner: any) => {
    setIsQuickCreatePartnerOpen(false);
    setQuickCreatePartnerDraft(null);
    handleHeaderChange('cliente_id', savedPartner.id);
    handleHeaderChange('cliente_nome', savedPartner.nome || 'Novo Cliente');
  };

  const handleProductQuickCreateSuccess = (savedProduct: any) => {
    setIsQuickCreateProductOpen(false);
    setQuickCreateProductDraft(null);
    handleAddItem({
      id: savedProduct.id,
      descricao: savedProduct.nome || 'Novo Produto',
      unidade: savedProduct.unidade || 'un',
      preco_venda: savedProduct.preco_venda || 0,
      type: 'product',
      codigo: savedProduct.codigo || null,
    } as any);
  };

  return (
    <>
      {showLoadingBanner && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border-b border-gray-200 bg-gray-50">
          <Loader2 className="animate-spin" size={14} />
          Carregando pedido...
        </div>
      )}
      <div className="flex flex-col h-full">
      <ParcelamentoDialog
        open={parcelamentoOpen}
        onClose={() => setParcelamentoOpen(false)}
        title="Gerar títulos (contas a receber)"
        total={Number(previewTotalGeral || 0)}
        defaultCondicao={formData.condicao_pagamento || '1x'}
        defaultBaseDateISO={String(formData.data_emissao || '').slice(0, 10) || new Date().toISOString().slice(0, 10)}
        defaultFormaPagamento={(formData as any).forma_pagamento || null}
        confirmText="Gerar títulos"
        onConfirm={async ({ condicao, baseDateISO, formaPagamento }) => {
          if (!formData.id) throw new Error('Pedido inválido.');
          const res = await createParcelamentoFromVenda({
            pedidoId: String(formData.id),
            condicao,
            baseDateISO,
            formaPagamento,
          });
          if (!res?.ok) throw new Error('Não foi possível gerar os títulos.');
          const firstId = res.contas_ids?.[0] || null;
          addToast(`Títulos gerados: ${res.count ?? 0}.`, 'success');
          navigate(firstId ? `/app/financeiro/contas-a-receber?contaId=${encodeURIComponent(firstId)}` : '/app/financeiro/contas-a-receber');
        }}
      />
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
                <table className="min-w-full divide-y divide-gray-200 table-fixed">
                  <TableColGroup columns={marketplaceTimelineColumns} widths={marketplaceTimelineWidths} />
                  <thead className="bg-gray-50">
                    <tr>
                      <ResizableSortableTh
                        columnId="quando"
                        label="Quando"
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                        sort={marketplaceTimelineSort as any}
                        onSort={(col) => setMarketplaceTimelineSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startMarketplaceTimelineResize}
                      />
                      <ResizableSortableTh
                        columnId="tipo"
                        label="Tipo"
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                        sort={marketplaceTimelineSort as any}
                        onSort={(col) => setMarketplaceTimelineSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startMarketplaceTimelineResize}
                      />
                      <ResizableSortableTh
                        columnId="mensagem"
                        label="Mensagem"
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                        sort={marketplaceTimelineSort as any}
                        onSort={(col) => setMarketplaceTimelineSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startMarketplaceTimelineResize}
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedMarketplaceTimeline.map((e, idx) => (
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
            <SearchFirstSelect
              value={formData.cliente_id || null}
              initialLabel={formData.cliente_nome || undefined}
              placeholder="Buscar cliente (Nome/CPF/CNPJ)…"
              disabled={isLocked}
              search={async (q, limit) => {
                const rows = await searchClients(q, limit);
                return (rows || []).map((h: any) => ({
                  id: h.id,
                  label: h.nome || h.label,
                  subtitle: h.doc_unico || null,
                }));
              }}
              onSelect={(hit) => {
                handleHeaderChange('cliente_id', hit.id);
                handleHeaderChange('cliente_nome', hit.label);
              }}
              onClear={() => {
                handleHeaderChange('cliente_id', null);
                handleHeaderChange('cliente_nome', '');
              }}
              createLabel="Criar cliente/fornecedor"
              onCreate={openQuickCreatePartner}
              openCreateInNewTabHref="/app/cadastros/clientes-fornecedores?new=1"
            />
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
              type="text"
              inputMode="numeric"
              placeholder="0,00"
              endAdornment="%"
              disabled={isLocked}
              {...comissaoProps}
            />
          </div>
          <div className="sm:col-span-2">
             <Input label="Data Emissão" type="date" value={formData.data_emissao} onChange={e => handleHeaderChange('data_emissao', e.target.value)} disabled={isLocked} />
          </div>
          <div className="sm:col-span-3">
             <Input label="Data Entrega" type="date" value={formData.data_entrega || ''} onChange={e => handleHeaderChange('data_entrega', e.target.value)} disabled={isLocked} />
          </div>
          <div className="sm:col-span-3">
            <Select
              label="Condição de Pagamento"
              name="condicao_pagamento"
              value={formData.condicao_pagamento || ''}
              onChange={(e) => handleHeaderChange('condicao_pagamento', e.target.value)}
              disabled={isLocked}
            >
              <option value="">Selecione...</option>
              {condicoesPagamento.map((c) => (
                <option key={c.id} value={c.condicao}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
            <MeioPagamentoDropdown
              tipo="recebimento"
              value={(formData as any).forma_pagamento || null}
              onChange={(v) => handleHeaderChange('forma_pagamento' as any, v)}
              disabled={isLocked}
              placeholder="Selecione..."
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tabela de preço</label>
            <select
              value={(formData as any)?.tabela_preco_id ?? ''}
              onChange={(e) => handleHeaderChange('tabela_preco_id' as any, e.target.value || null)}
              className="w-full p-3 border border-gray-300 rounded-lg"
              disabled={isLocked}
            >
              <option value="">Varejo (padrão)</option>
              {tabelasPreco
                .filter((t) => t.status !== 'inativa')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
            </select>
            <div className="text-xs text-gray-500 mt-1">Atacado/Varejo e preços por quantidade.</div>
          </div>
        </Section>

        <Section title="Itens" description="Produtos vendidos.">
          {!isLocked && (
            <div className="sm:col-span-6 mb-4">
              <SearchFirstSelect
                value={null}
                placeholder="Buscar produto ou serviço…"
                disabled={isLocked}
                search={async (q, limit) => {
                  const rows = await searchItemsForOs(q, limit, true, 'all');
                  return (rows || []).map((r: any) => ({
                    id: `${r.type}:${r.id}`,
                    label: r.descricao,
                    subtitle: `${String(r.unidade || '').toUpperCase()} • ${formatMoneyBRL(Number(r.preco_venda) || 0)}`,
                    meta: r,
                  }));
                }}
                onSelect={(hit) => {
                  const r = hit.meta as any;
                  if (r) handleAddItem(r);
                }}
                createLabel="Criar produto"
                onCreate={openQuickCreateProduct}
                openCreateInNewTabHref="/app/products?new=1"
              />
            </div>
          )}
          
          <div className="sm:col-span-6 overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 table-fixed">
              <TableColGroup columns={itensTableColumns} widths={itensTableWidths} />
              <thead className="bg-gray-50">
                <tr>
                  <ResizableSortableTh
                    columnId="produto"
                    label="Produto"
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                    sortable={false}
                    resizable
                    onResizeStart={startItensResize}
                  />
                  <ResizableSortableTh
                    columnId="qtd"
                    label="Qtd"
                    align="right"
                    className="px-3 py-2 text-xs font-medium text-gray-500"
                    sortable={false}
                    resizable
                    onResizeStart={startItensResize}
                  />
                  <ResizableSortableTh
                    columnId="preco_unit"
                    label="Preço Unit."
                    align="right"
                    className="px-3 py-2 text-xs font-medium text-gray-500"
                    sortable={false}
                    resizable
                    onResizeStart={startItensResize}
                  />
                  <ResizableSortableTh
                    columnId="desc"
                    label="Desc."
                    align="right"
                    className="px-3 py-2 text-xs font-medium text-gray-500"
                    sortable={false}
                    resizable
                    onResizeStart={startItensResize}
                  />
                  <ResizableSortableTh
                    columnId="total"
                    label="Total"
                    align="right"
                    className="px-3 py-2 text-xs font-medium text-gray-500"
                    sortable={false}
                    resizable
                    onResizeStart={startItensResize}
                  />
                  {!isLocked ? (
                    <ResizableSortableTh
                      columnId="acoes"
                      label=""
                      className="px-3 py-2"
                      sortable={false}
                      resizable
                      onResizeStart={startItensResize}
                    />
                  ) : null}
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
                      {String((item as any).produto_unidade || '').toUpperCase() === 'KG' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={String(qtyUnitMode[item.id] === 'g' ? Number(item.quantidade || 0) * 1000 : Number(item.quantidade || 0))}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              if (!raw) return;
                              const parsed = parseFloat(raw.replace(',', '.'));
                              const n = Number.isFinite(parsed) ? parsed : 0;
                              const qtyKg = qtyUnitMode[item.id] === 'g' ? n / 1000 : n;
                              handleUpdateItem(item.id, 'quantidade', qtyKg);
                            }}
                            disabled={isLocked}
                            className="w-full text-right p-1 border rounded text-sm"
                            min="0.001"
                            step="any"
                          />
                          <select
                            className="p-1 border rounded text-xs text-gray-700 bg-white"
                            value={qtyUnitMode[item.id] ?? 'base'}
                            onChange={(e) => setQtyUnitMode((prev) => ({ ...prev, [item.id]: e.target.value as any }))}
                            disabled={isLocked}
                            title="Unidade de entrada (o sistema armazena em KG)"
                          >
                            <option value="base">kg</option>
                            <option value="g">g</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={String(Number(item.quantidade || 0))}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              if (!raw) return;
                              const parsed = parseFloat(raw.replace(',', '.'));
                              handleUpdateItem(item.id, 'quantidade', parsed);
                            }}
                            disabled={isLocked}
                            className="w-full text-right p-1 border rounded text-sm"
                            min="0.001"
                            step="any"
                          />
                          <span className="text-xs text-gray-500 w-10 text-right">{(item as any).produto_unidade || ''}</span>
                        </div>
                      )}
                      {String((item as any).produto_unidade || '').toUpperCase() === 'KG' ? (
                        <div className="text-[11px] text-gray-500 mt-1 text-right">Dica: 400g = 0,400kg.</div>
                      ) : null}
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
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <TableColGroup columns={discountAuditColumns} widths={discountAuditWidths} />
                <thead className="bg-gray-50">
                  <tr>
                    <ResizableSortableTh
                      columnId="quando"
                      label="Quando"
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                      sort={discountAuditSort as any}
                      onSort={(col) => setDiscountAuditSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startDiscountAuditResize}
                    />
                    <ResizableSortableTh
                      columnId="onde"
                      label="Onde"
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                      sort={discountAuditSort as any}
                      onSort={(col) => setDiscountAuditSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startDiscountAuditResize}
                    />
                    <ResizableSortableTh
                      columnId="campo"
                      label="Campo"
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                      sort={discountAuditSort as any}
                      onSort={(col) => setDiscountAuditSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startDiscountAuditResize}
                    />
                    <ResizableSortableTh
                      columnId="de"
                      label="De"
                      align="right"
                      className="px-3 py-2 text-xs font-medium text-gray-500"
                      sort={discountAuditSort as any}
                      onSort={(col) => setDiscountAuditSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startDiscountAuditResize}
                    />
                    <ResizableSortableTh
                      columnId="para"
                      label="Para"
                      align="right"
                      className="px-3 py-2 text-xs font-medium text-gray-500"
                      sort={discountAuditSort as any}
                      onSort={(col) => setDiscountAuditSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startDiscountAuditResize}
                    />
                    <ResizableSortableTh
                      columnId="quem"
                      label="Quem"
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                      sort={discountAuditSort as any}
                      onSort={(col) => setDiscountAuditSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startDiscountAuditResize}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedDiscountAudit.map((e, idx) => (
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
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white">
            Fechar
          </button>
          {formData.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white text-sm">
                  <Printer size={14} /> Imprimir <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => handlePrint('completo')}>
                  Pedido Completo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePrint('simples')}>
                  Separação (sem preços)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex gap-3">
          {canConcluir && (
            <button
              onClick={handleConcluir}
              disabled={isSaving || authLoading || !activeEmpresaId || empresaChanged}
              className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <PackageCheck size={20} /> Concluir (baixa estoque)
            </button>
          )}
          {formData.status === 'concluido' && (
            <button
              onClick={() => setParcelamentoOpen(true)}
              disabled={isSaving || authLoading || !activeEmpresaId || empresaChanged}
              className="flex items-center gap-2 bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              <Wallet size={20} /> Gerar Financeiro
            </button>
          )}
          {canGerarNfe && (
            <button
              onClick={handleGerarNfeFromForm}
              disabled={isSaving || gerandoNfe || authLoading || !activeEmpresaId || empresaChanged}
              className="flex items-center gap-2 bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {gerandoNfe ? <Loader2 className="animate-spin" size={20} /> : <FileText size={20} />}
              Gerar NF-e
            </button>
          )}
          {formData.id && formData.status !== 'cancelado' && formData.status !== 'concluido' && (
            <button
              onClick={handleCancel}
              disabled={isSaving || authLoading || !activeEmpresaId || empresaChanged}
              className="flex items-center gap-2 bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <Ban size={20} /> Cancelar
            </button>
          )}
          {formData.status === 'orcamento' && (
            <button
              onClick={handleAprovar}
              aria-label="Aprovar Venda"
              disabled={isSaving || empresaChanged}
              className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle size={20} /> Aprovar Venda
            </button>
          )}
          {!isLocked && (
            <button 
              onClick={handleSaveHeader} 
              disabled={isSaving || authLoading || !activeEmpresaId || empresaChanged}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Salvar
            </button>
          )}
        </div>
      </footer>
      </div>

      <SideSheet
        isOpen={isQuickCreatePartnerOpen}
        onClose={() => {
          setIsQuickCreatePartnerOpen(false);
          setQuickCreatePartnerDraft(null);
        }}
        title="Criar cliente/fornecedor"
        description="Fluxo ‘search-first’: use a busca para evitar duplicados. Se não encontrar, crie aqui e o pedido será atualizado automaticamente."
      >
        <PartnerFormPanel
          partner={null}
          initialValues={quickCreatePartnerInitialValues}
          onSaveSuccess={handlePartnerQuickCreateSuccess}
          onClose={() => {
            setIsQuickCreatePartnerOpen(false);
            setQuickCreatePartnerDraft(null);
          }}
        />
      </SideSheet>

      <SideSheet
        isOpen={isQuickCreateProductOpen}
        onClose={() => {
          setIsQuickCreateProductOpen(false);
          setQuickCreateProductDraft(null);
        }}
        title="Criar produto"
        description="Crie o item e ele será inserido automaticamente no pedido."
      >
        <ProductFormPanel
          product={null}
          initialValues={quickCreateProductInitialValues}
          onSaveSuccess={handleProductQuickCreateSuccess}
          onClose={() => {
            setIsQuickCreateProductOpen(false);
            setQuickCreateProductDraft(null);
          }}
          saveProduct={(data) => saveProduct(data, '')}
        />
      </SideSheet>
    </>
  );
}
