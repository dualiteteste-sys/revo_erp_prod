import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { AlertTriangle, Ban, Calculator, Copy, Download, Eye, FileText, Lightbulb, Loader2, Plus, Receipt, Search, Send, Settings, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import NaturezaOperacaoAutocomplete from '@/components/common/NaturezaOperacaoAutocomplete';
import ProductAutocomplete from '@/components/common/ProductAutocomplete';
import UnidadeMedidaSelect from '@/components/common/UnidadeMedidaSelect';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import {
  fiscalNfeAuditTimelineList,
  fiscalNfeCancelar,
  fiscalNfeConsultaStatus,
  fiscalNfeEmissaoDraftUpsert,
  fiscalNfeEmissaoDelete,
  fiscalNfeEmissaoItensList,
  fiscalNfeEmissoesList,
  fiscalNfeFetchDocument,
  fiscalNfeSubmit,
  fiscalNfeCalcularImpostos,
} from '@/services/fiscalNfeEmissoes';
import { callRpc } from '@/lib/api';
import { getRejectionInfo, parseRejectionCode } from '@/lib/fiscal/nfe-rejection-catalog';
import { calculateItemTax, type NaturezaFiscalConfig, type CalculatedImpostos } from '@/lib/fiscal/tax-calculator';
import type { NaturezaOperacaoSearchHit } from '@/services/fiscalNaturezasOperacao';
import { fiscalNaturezasOperacaoGet } from '@/services/fiscalNaturezasOperacao';
import { getFiscalNfeEmitente } from '@/services/fiscalNfeSettings';
import { getPartnerPrimaryUf } from '@/services/partners';
import { searchCondicoesPagamento, type CondicaoPagamento } from '@/services/condicoesPagamento';
import { getCarriers, type CarrierListItem } from '@/services/carriers';
import { fiscalNfeGerarDuplicatas, type DuplicataItem } from '@/services/fiscalNfeEmissoes';
import NfeStatusBadge from '@/components/fiscal/NfeStatusBadge';
import NfeModeToggle, { getNfeMode, setNfeMode, type NfeMode } from '@/components/fiscal/NfeModeToggle';

type AmbienteNfe = 'homologacao' | 'producao';

type NfeEmissao = {
  id: string;
  status: string;
  numero: number | null;
  serie: number | null;
  chave_acesso: string | null;
  destinatario_pessoa_id: string | null;
  destinatario_nome: string | null;
  valor_total: number | null;
  total_produtos?: number | null;
  total_descontos?: number | null;
  total_frete?: number | null;
  total_impostos?: number | null;
  total_nfe?: number | null;
  natureza_operacao?: string | null;
  natureza_operacao_id?: string | null;
  ambiente: AmbienteNfe;
  payload: any;
  last_error: string | null;
  rejection_code: string | null;
  reprocess_count: number;
  created_at: string;
  updated_at: string;
  pedido_origem_id?: string | null;
  danfe_url?: string | null;
  xml_url?: string | null;
  forma_pagamento?: string | null;
  condicao_pagamento_id?: string | null;
  condicao_pagamento_nome?: string | null;
  transportadora_id?: string | null;
  transportadora_nome?: string | null;
  modalidade_frete?: string | null;
  duplicatas?: any;
  peso_bruto?: number | null;
  peso_liquido?: number | null;
  quantidade_volumes?: number | null;
  especie_volumes?: string | null;
};

type NfeItemForm = {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_desconto: number;
  ncm: string;
  cfop: string;
  cst: string;
  csosn: string;
  informacoes_adicionais: string;
  codigo_beneficio_fiscal: string;
  impostos?: CalculatedImpostos | null;
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Pré-NF-e',
  em_composicao: 'Em Composição',
  aguardando_validacao: 'Aguardando Validação',
  com_pendencias: 'Com Pendências',
  pronta: 'Pronta p/ Emissão',
  enfileirada: 'Enfileirada',
  processando: 'Processando',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
  erro: 'Erro',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  rascunho: 'bg-indigo-100 text-indigo-800',
  em_composicao: 'bg-blue-100 text-blue-800',
  aguardando_validacao: 'bg-yellow-100 text-yellow-800',
  com_pendencias: 'bg-orange-100 text-orange-800',
  pronta: 'bg-teal-100 text-teal-800',
  enfileirada: 'bg-amber-100 text-amber-800',
  processando: 'bg-amber-100 text-amber-800',
  autorizada: 'bg-emerald-100 text-emerald-800',
  rejeitada: 'bg-red-100 text-red-800',
  cancelada: 'bg-slate-100 text-slate-600',
  erro: 'bg-red-100 text-red-800',
};

const DELETABLE_STATUSES = ['rascunho', 'em_composicao', 'aguardando_validacao', 'com_pendencias', 'pronta', 'erro', 'rejeitada'];

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

function isProcessandoStale(row: { status: string; updated_at: string }) {
  return (
    row.status === 'processando' &&
    Date.now() - new Date(row.updated_at).getTime() > 10 * 60 * 1000
  );
}

type RejectionCardProps = {
  code: string | null;
  lastError: string | null;
  reprocessCount: number;
};

function RejectionCard({ code, lastError, reprocessCount }: RejectionCardProps) {
  const info = getRejectionInfo(code);
  if (!info && !lastError) return null;

  if (!info) {
    // Fallback: raw display (backward compat)
    if (!lastError) return null;
    return (
      <div className="text-xs text-red-600 mt-1">
        {lastError.includes(' | ')
          ? lastError.split(' | ').map((part, i) =>
              i === 0
                ? <div key={i} className="font-semibold">{part}</div>
                : <div key={i} className="ml-2">{part.split('; ').map((field, j) => <div key={j}>• {field}</div>)}</div>
            )
          : lastError}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold bg-red-200 text-red-800">
          [{code}]
        </span>
        <span className="font-semibold text-red-800">{info.descricao}</span>
        {reprocessCount > 0 && (
          <span className="ml-auto text-red-500 whitespace-nowrap">Tentativa {reprocessCount}</span>
        )}
      </div>
      <p className="text-red-700">{info.causa}</p>
      <div className="flex items-start gap-1 text-amber-800 bg-amber-50 rounded px-1.5 py-1">
        <Lightbulb size={12} className="mt-0.5 shrink-0 text-amber-600" />
        <span>{info.acao}</span>
      </div>
    </div>
  );
}

export default function NfeEmissoesPage() {
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const features = useEmpresaFeatures();
  const location = useLocation();
  const navigate = useNavigate();

  const empresaId = activeEmpresa?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [fetchingDoc, setFetchingDoc] = useState<string | null>(null);
  const [rows, setRows] = useState<NfeEmissao[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [previewXml, setPreviewXml] = useState<string>('');
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditItems, setAuditItems] = useState<any[]>([]);
  const [auditEmissaoId, setAuditEmissaoId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [sort, setSort] = useState<SortState<string>>({ column: 'atualizado', direction: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nfeMode, setNfeModeState] = useState<NfeMode>(getNfeMode);
  const [recalculating, setRecalculating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NfeEmissao | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<NfeEmissao | null>(null);
  const [cancelJust, setCancelJust] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const columns: TableColumnWidthDef[] = [
    { id: 'checkbox', defaultWidth: 48, minWidth: 40 },
    { id: 'status', defaultWidth: 180, minWidth: 140 },
    { id: 'destinatario', defaultWidth: 200, minWidth: 150 },
    { id: 'natureza', defaultWidth: 180, minWidth: 140 },
    { id: 'numero_serie', defaultWidth: 120, minWidth: 100 },
    { id: 'ambiente', defaultWidth: 120, minWidth: 100 },
    { id: 'valor', defaultWidth: 140, minWidth: 120 },
    { id: 'atualizado', defaultWidth: 160, minWidth: 140 },
    { id: 'acao', defaultWidth: 320, minWidth: 260 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'fiscal:nfe-emissoes', columns });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<NfeEmissao | null>(null);
  const [formAmbiente, setFormAmbiente] = useState<AmbienteNfe>('homologacao');
  const [formFrete, setFormFrete] = useState<string>('');
  const [formNaturezaOperacao, setFormNaturezaOperacao] = useState<string>('');
  const [formNaturezaOperacaoId, setFormNaturezaOperacaoId] = useState<string | null>(null);
  const [formNaturezaOperacaoName, setFormNaturezaOperacaoName] = useState<string | undefined>(undefined);
  const [formFormaPagamento, setFormFormaPagamento] = useState<string>('');
  const [formModalidadeFrete, setFormModalidadeFrete] = useState<string>('9');
  const [formDestinatarioId, setFormDestinatarioId] = useState<string | null>(null);
  const [formDestinatarioName, setFormDestinatarioName] = useState<string | undefined>(undefined);
  const [formCondicaoPagamentoId, setFormCondicaoPagamentoId] = useState<string | null>(null);
  const [formCondicaoPagamentoNome, setFormCondicaoPagamentoNome] = useState<string>('');
  const [condicaoHits, setCondicaoHits] = useState<CondicaoPagamento[]>([]);
  const [condicaoLoading, setCondicaoLoading] = useState(false);
  const [formTransportadoraId, setFormTransportadoraId] = useState<string | null>(null);
  const [formTransportadoraNome, setFormTransportadoraNome] = useState<string>('');
  const [transportadoraHits, setTransportadoraHits] = useState<CarrierListItem[]>([]);
  const [transportadoraLoading, setTransportadoraLoading] = useState(false);
  const [duplicatasPreview, setDuplicatasPreview] = useState<DuplicataItem[]>([]);
  const [formPesoBruto, setFormPesoBruto] = useState<string>('');
  const [formPesoLiquido, setFormPesoLiquido] = useState<string>('');
  const [formQtdVolumes, setFormQtdVolumes] = useState<string>('');
  const [formEspecieVolumes, setFormEspecieVolumes] = useState<string>('VOLUMES');
  const [items, setItems] = useState<NfeItemForm[]>([]);
  const [productToAddId, setProductToAddId] = useState<string | null>(null);
  const [productToAddName, setProductToAddName] = useState<string | undefined>(undefined);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);
  const [emitenteCrt, setEmitenteCrt] = useState<number | null>(null);
  const [emitenteUf, setEmitenteUf] = useState<string | null>(null);
  const [destinatarioUf, setDestinatarioUf] = useState<string | null>(null);
  const [naturezaConfig, setNaturezaConfig] = useState<NaturezaFiscalConfig | null>(null);

  const canShow = useMemo(() => !!empresaId, [empresaId]);

  const fetchList = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const data = await fiscalNfeEmissoesList({
        status: statusFilter || undefined,
        q: search.trim() || undefined,
        limit: 200,
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
      });

      const list: NfeEmissao[] = (data || []).map((r: any) => ({
        id: r.id,
        status: r.status,
        numero: r.numero ?? null,
        serie: r.serie ?? null,
        chave_acesso: r.chave_acesso ?? null,
        destinatario_pessoa_id: r.destinatario_pessoa_id ?? null,
        destinatario_nome: r.destinatario_nome ?? null,
        valor_total: r.valor_total ?? null,
        total_produtos: r.total_produtos ?? null,
        total_descontos: r.total_descontos ?? null,
        total_frete: r.total_frete ?? null,
        total_impostos: r.total_impostos ?? null,
        total_nfe: r.total_nfe ?? null,
        natureza_operacao: r.natureza_operacao ?? null,
        natureza_operacao_id: r.natureza_operacao_id ?? null,
        ambiente: (r.ambiente ?? 'homologacao') as AmbienteNfe,
        payload: r.payload ?? {},
        last_error: r.last_error ?? null,
        rejection_code: r.rejection_code ?? null,
        reprocess_count: r.reprocess_count ?? 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
        pedido_origem_id: r.pedido_origem_id ?? null,
        danfe_url: r.danfe_url ?? null,
        xml_url: r.xml_url ?? null,
        forma_pagamento: r.forma_pagamento ?? null,
        condicao_pagamento_id: r.condicao_pagamento_id ?? null,
        condicao_pagamento_nome: r.condicao_pagamento_nome ?? null,
        transportadora_id: r.transportadora_id ?? null,
        transportadora_nome: r.transportadora_nome ?? null,
        modalidade_frete: r.modalidade_frete ?? null,
        duplicatas: r.duplicatas ?? null,
        peso_bruto: r.peso_bruto ?? null,
        peso_liquido: r.peso_liquido ?? null,
        quantidade_volumes: r.quantidade_volumes ?? null,
        especie_volumes: r.especie_volumes ?? null,
      }));

      setRows(list);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao listar NF-e.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, empresaId, search, statusFilter, dataInicio, dataFim]);

  useEffect(() => {
    if (!empresaId) return;
    void fetchList();
  }, [empresaId, fetchList]);

  // Poll every 5 s while any NF-e is still being processed by SEFAZ.
  // Calls focusnfe-status for each processando NF-e to sync the real status
  // from the Focus NFe API into the DB, then refreshes the list.
  useEffect(() => {
    const processingRows = rows.filter((r) => r.status === 'processando');
    if (processingRows.length === 0) return;
    const interval = setInterval(async () => {
      await Promise.all(processingRows.map((r) => fiscalNfeConsultaStatus(r.id)));
      void fetchList();
    }, 5000);
    return () => clearInterval(interval);
  }, [rows, fetchList]);

  // Auto-open NF-e from ?open= query parameter (e.g. after "Gerar NF-e" redirect)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (!openId || loading || rows.length === 0) return;
    const row = rows.find((r) => r.id === openId);
    if (row) {
      void openEdit(row);
    }
    // Clear the param to avoid re-opening on every re-render
    params.delete('open');
    const newSearch = params.toString();
    navigate(newSearch ? `${location.pathname}?${newSearch}` : location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, loading, location.search]);

  // Carregar condições de pagamento e transportadoras quando o modal abre
  useEffect(() => {
    if (!isModalOpen || !empresaId) return;
    let cancelled = false;

    (async () => {
      setCondicaoLoading(true);
      try {
        const data = await searchCondicoesPagamento({ tipo: 'receber', q: null, limit: 50 });
        if (!cancelled) setCondicaoHits(data ?? []);
      } catch { /* ignore */ } finally {
        if (!cancelled) setCondicaoLoading(false);
      }
    })();

    (async () => {
      setTransportadoraLoading(true);
      try {
        const res = await getCarriers({ page: 1, pageSize: 50, searchTerm: '', filterStatus: 'ativa', sortBy: { column: 'nome', ascending: true } });
        if (!cancelled) setTransportadoraHits(res.data ?? []);
      } catch { /* ignore */ } finally {
        if (!cancelled) setTransportadoraLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isModalOpen, empresaId]);

  // Load emitter CRT + UF when modal opens (needed for tax calculation)
  useEffect(() => {
    if (!isModalOpen || !empresaId) return;
    let cancelled = false;
    (async () => {
      try {
        const emitente = await getFiscalNfeEmitente();
        if (!cancelled && emitente) {
          setEmitenteCrt(emitente.crt ?? null);
          setEmitenteUf(emitente.endereco_uf ?? null);
        }
      } catch { /* silent — tax preview won't work */ }
    })();
    return () => { cancelled = true; };
  }, [isModalOpen, empresaId]);

  // Recalc all items when destinatário UF changes (CFOP intra↔inter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (items.length > 0 && naturezaConfig) recalcAllItemImpostos(); }, [destinatarioUf]);

  const totals = useMemo(() => {
    const total = rows.length;
    const rascunhos = rows.filter((r) => r.status === 'rascunho').length;
    const autorizadas = rows.filter((r) => r.status === 'autorizada').length;
    const pendentes = rows.filter((r) => ['enfileirada', 'processando'].includes(r.status)).length;
    const rejeitadasErro = rows.filter((r) => ['rejeitada', 'erro'].includes(r.status)).length;
    const totalAutorizadasValor = rows
      .filter((r) => r.status === 'autorizada')
      .reduce((sum, r) => sum + (r.total_nfe ?? r.valor_total ?? 0), 0);
    return { total, rascunhos, autorizadas, pendentes, rejeitadasErro, totalAutorizadasValor };
  }, [rows]);

  const exportCsv = () => {
    const headers = ['Número', 'Série', 'Chave de Acesso', 'Destinatário', 'Natureza da Operação', 'Ambiente', 'Valor Total (R$)', 'Status', 'Emissão'];
    const csvRows = rows.map((r) => [
      r.numero ?? '',
      r.serie ?? '',
      r.chave_acesso ?? '',
      r.destinatario_nome ?? '',
      r.natureza_operacao ?? '',
      r.ambiente === 'producao' ? 'Produção' : 'Homologação',
      (r.total_nfe ?? r.valor_total ?? 0).toFixed(2).replace('.', ','),
      STATUS_LABEL[r.status] ?? r.status,
      new Date(r.created_at).toLocaleDateString('pt-BR'),
    ]);
    const csv = [headers, ...csvRows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfe-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortedRows = useMemo(() => {
    return sortRows(
      rows,
      sort as any,
      [
        { id: 'status', type: 'string', getValue: (r) => STATUS_LABEL[r.status] || r.status },
        { id: 'destinatario', type: 'string', getValue: (r) => r.destinatario_nome ?? '' },
        { id: 'natureza', type: 'string', getValue: (r) => r.natureza_operacao ?? '' },
        { id: 'numero_serie', type: 'number', getValue: (r) => Number(r.numero ?? 0) * 1000 + Number(r.serie ?? 0) },
        { id: 'ambiente', type: 'string', getValue: (r) => r.ambiente ?? '' },
        { id: 'valor', type: 'number', getValue: (r) => Number(r.total_nfe ?? r.valor_total ?? 0) },
        { id: 'atualizado', type: 'date', getValue: (r) => r.updated_at ?? null },
      ] as const
    );
  }, [rows, sort]);

  const deletableRows = useMemo(() => sortedRows.filter((r) => DELETABLE_STATUSES.includes(r.status)), [sortedRows]);
  const selectedCount = selected.size;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === deletableRows.length && deletableRows.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(deletableRows.map((r) => r.id)));
    }
  };

  // Clear selection when rows change
  useEffect(() => { setSelected(new Set()); }, [rows]);

  const handleDeleteSingle = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fiscalNfeEmissaoDelete(deleteTarget.id);
      addToast('NF-e excluída com sucesso.', 'success');
      setDeleteTarget(null);
      await fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir NF-e.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    let successCount = 0;
    let errorCount = 0;
    for (const id of ids) {
      try {
        await fiscalNfeEmissaoDelete(id);
        successCount++;
      } catch {
        errorCount++;
      }
    }
    if (successCount > 0) addToast(`${successCount} NF-e(s) excluída(s) com sucesso.`, 'success');
    if (errorCount > 0) addToast(`${errorCount} NF-e(s) não puderam ser excluídas.`, 'error');
    setShowBulkDeleteConfirm(false);
    setSelected(new Set());
    setBulkDeleting(false);
    await fetchList();
  };

  const handleCancelNfe = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fiscalNfeCancelar(cancelTarget.id, cancelJust.trim());
      if (res.ok) {
        addToast('NF-e cancelada com sucesso junto à SEFAZ.', 'success');
        setCancelTarget(null);
        setCancelJust('');
        await fetchList();
      } else {
        addToast(res.detail || res.error || 'Erro ao cancelar NF-e.', 'error');
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao cancelar NF-e.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const openNew = async () => {
    setEditing(null);
    setFormAmbiente('homologacao');
    setFormFrete('');
    setFormNaturezaOperacao('');
    setFormNaturezaOperacaoId(null);
    setFormNaturezaOperacaoName(undefined);
    setFormFormaPagamento('');
    setFormModalidadeFrete('9');
    setFormDestinatarioId(null);
    setFormDestinatarioName(undefined);
    setFormCondicaoPagamentoId(null);
    setFormCondicaoPagamentoNome('');
    setFormTransportadoraId(null);
    setFormTransportadoraNome('');
    setDuplicatasPreview([]);
    setFormPesoBruto('');
    setFormPesoLiquido('');
    setFormQtdVolumes('');
    setFormEspecieVolumes('VOLUMES');
    setItems([]);
    setProductToAddId(null);
    setProductToAddName(undefined);
    setNaturezaConfig(null);
    setDestinatarioUf(null);
    setIsModalOpen(true);
  };

  const openEdit = async (row: NfeEmissao) => {
    setEditing(row);
    setFormAmbiente(row.ambiente || 'homologacao');
    setFormFrete(row.total_frete != null ? String(row.total_frete) : '');
    setFormNaturezaOperacao((row.natureza_operacao ?? '').toString());
    setFormNaturezaOperacaoId(row.natureza_operacao_id ?? null);
    setFormNaturezaOperacaoName(row.natureza_operacao ?? undefined);
    setFormFormaPagamento(row.forma_pagamento ?? '');
    setFormModalidadeFrete(row.modalidade_frete ?? '9');
    setFormDestinatarioId(row.destinatario_pessoa_id ?? null);
    setFormDestinatarioName(row.destinatario_nome ?? undefined);
    setFormCondicaoPagamentoId(row.condicao_pagamento_id ?? null);
    setFormCondicaoPagamentoNome(row.condicao_pagamento_nome ?? '');
    setFormTransportadoraId(row.transportadora_id ?? null);
    setFormTransportadoraNome(row.transportadora_nome ?? '');
    setDuplicatasPreview(row.duplicatas ?? []);
    setFormPesoBruto(row.peso_bruto ? String(row.peso_bruto) : '');
    setFormPesoLiquido(row.peso_liquido ? String(row.peso_liquido) : '');
    setFormQtdVolumes(row.quantidade_volumes ? String(row.quantidade_volumes) : '');
    setFormEspecieVolumes(row.especie_volumes || 'VOLUMES');
    setProductToAddId(null);
    setProductToAddName(undefined);

    // Load natureza fiscal config for tax calculation
    if (row.natureza_operacao_id) {
      fiscalNaturezasOperacaoGet(row.natureza_operacao_id).then(nat => {
        if (nat) {
          setNaturezaConfig({
            cfop_dentro_uf: nat.cfop_dentro_uf ?? null,
            cfop_fora_uf: nat.cfop_fora_uf ?? null,
            icms_cst: nat.icms_cst ?? null,
            icms_csosn: nat.icms_csosn ?? null,
            icms_aliquota: Number(nat.icms_aliquota) || 0,
            icms_reducao_base: Number(nat.icms_reducao_base) || 0,
            codigo_beneficio_fiscal: nat.codigo_beneficio_fiscal ?? null,
            pis_cst: nat.pis_cst ?? null,
            pis_aliquota: Number(nat.pis_aliquota) || 0,
            cofins_cst: nat.cofins_cst ?? null,
            cofins_aliquota: Number(nat.cofins_aliquota) || 0,
            ipi_cst: nat.ipi_cst ?? null,
            ipi_aliquota: Number(nat.ipi_aliquota) || 0,
          });
        }
      }).catch(() => { /* silent */ });
    } else {
      setNaturezaConfig(null);
    }

    // Load destinatário UF for intra/inter-state CFOP
    if (row.destinatario_pessoa_id) {
      getPartnerPrimaryUf(row.destinatario_pessoa_id).then(uf => setDestinatarioUf(uf)).catch(() => setDestinatarioUf(null));
    } else {
      setDestinatarioUf(null);
    }

    try {
      const data = await fiscalNfeEmissaoItensList(row.id);
      setItems(
        (data || []).map((it: any) => ({
          id: it.id,
          produto_id: it.produto_id ?? null,
          produto_nome: (it.descricao || 'Item').toString(),
          unidade: (it.unidade || 'un').toString(),
          quantidade: Number(it.quantidade ?? 1) || 1,
          valor_unitario: Number(it.valor_unitario ?? 0) || 0,
          valor_desconto: Number(it.valor_desconto ?? 0) || 0,
          ncm: (it.ncm ?? '').toString(),
          cfop: (it.cfop ?? '').toString(),
          cst: (it.cst ?? '').toString(),
          csosn: (it.csosn ?? '').toString(),
          informacoes_adicionais: (it.informacoes_adicionais ?? '').toString(),
          codigo_beneficio_fiscal: (it.codigo_beneficio_fiscal ?? '').toString(),
          impostos: it.impostos || null,
        }))
      );
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar itens do rascunho.', 'error');
      setItems([]);
    }

    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setDraftErrors([]);
  };

  const totalsDraft = useMemo(() => {
    const frete = formFrete.trim() ? Number(String(formFrete).replace(',', '.')) : 0;
    const total_produtos = items.reduce((acc, it) => acc + it.quantidade * it.valor_unitario, 0);
    const total_descontos = items.reduce((acc, it) => acc + (it.valor_desconto || 0), 0);
    const total_impostos = items.reduce((acc, it) => acc + (it.impostos?.total || 0), 0);
    const total_nfe = Math.max(0, total_produtos - total_descontos + (Number.isFinite(frete) ? frete : 0) + total_impostos);
    return { frete, total_produtos, total_descontos, total_impostos, total_nfe };
  }, [items, formFrete]);

  const validateDraftLocal = useCallback(() => {
    const errors: string[] = [];

    const frete = totalsDraft.frete;
    if (formFrete.trim() && (!Number.isFinite(frete) || frete < 0)) {
      errors.push('Frete inválido.');
    }

    if (!formNaturezaOperacao?.trim()) {
      errors.push('Natureza da operação é obrigatória.');
    }

    if (!formDestinatarioId) {
      errors.push('Selecione um destinatário.');
    }

    if (!items.length) {
      errors.push('Adicione ao menos 1 item ao rascunho.');
    }

    items.forEach((it, idx) => {
      const prefix = `Item ${idx + 1}`;

      if (!it.produto_nome?.trim()) {
        errors.push(`${prefix}: descrição é obrigatória.`);
      }
      if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) {
        errors.push(`${prefix}: quantidade inválida.`);
      }
      if (!Number.isFinite(it.valor_unitario) || it.valor_unitario < 0) {
        errors.push(`${prefix}: valor unitário inválido.`);
      }
      if (!Number.isFinite(it.valor_desconto) || it.valor_desconto < 0) {
        errors.push(`${prefix}: desconto inválido.`);
      } else if (it.valor_desconto > it.quantidade * it.valor_unitario) {
        errors.push(`${prefix}: desconto não pode ser maior que o total do item.`);
      }

      const ncm = (it.ncm || '').replace(/\D/g, '');
      if (ncm.length !== 8) {
        errors.push(`${prefix}: NCM deve ter 8 dígitos.`);
      }

      const cfop = (it.cfop || '').replace(/\D/g, '');
      if (cfop.length !== 4) {
        errors.push(`${prefix}: CFOP deve ter 4 dígitos.`);
      }

      const cst = (it.cst || '').trim();
      const csosn = (it.csosn || '').trim();
      if (!cst && !csosn) {
        errors.push(`${prefix}: informe CST ou CSOSN.`);
      }
    });

    const uniq = Array.from(new Set(errors));
    setDraftErrors(uniq);
    return { ok: uniq.length === 0, errors: uniq };
  }, [formDestinatarioId, formFrete, formNaturezaOperacao, items, totalsDraft.frete]);

  const persistDraft = async (): Promise<string> => {
    if (!empresaId) throw new Error('Selecione uma empresa ativa.');
    if (!items.length) throw new Error('Adicione ao menos 1 item ao rascunho.');

    const frete = totalsDraft.frete;
    if (formFrete.trim() && (!Number.isFinite(frete) || frete < 0)) {
      throw new Error('Frete inválido.');
    }

    const payloadJson = {
      version: 1,
      ambiente: formAmbiente,
      natureza_operacao: formNaturezaOperacao?.trim() || null,
      destinatario_pessoa_id: formDestinatarioId ?? null,
      totais: {
        total_produtos: totalsDraft.total_produtos,
        total_descontos: totalsDraft.total_descontos,
        total_frete: frete,
        total_impostos: 0,
        total_nfe: totalsDraft.total_nfe,
      },
      itens: items.map((it) => ({
        produto_id: it.produto_id,
        descricao: it.produto_nome,
        unidade: it.unidade,
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
        valor_desconto: it.valor_desconto,
        ncm: it.ncm || null,
        cfop: it.cfop || null,
        cst: it.cst || null,
        csosn: it.csosn || null,
      })),
    };

    const emissaoId = await fiscalNfeEmissaoDraftUpsert({
      emissaoId: editing?.id ?? null,
      destinatarioPessoaId: formDestinatarioId ?? '',
      ambiente: formAmbiente,
      naturezaOperacao: formNaturezaOperacao?.trim() || '',
      naturezaOperacaoId: formNaturezaOperacaoId ?? undefined,
      totalFrete: frete,
      formaPagamento: formFormaPagamento || undefined,
      condicaoPagamentoId: formCondicaoPagamentoId ?? undefined,
      transportadoraId: formTransportadoraId ?? undefined,
      modalidadeFrete: formModalidadeFrete || '9',
      pesoBruto: formPesoBruto ? Number(String(formPesoBruto).replace(',', '.')) || 0 : 0,
      pesoLiquido: formPesoLiquido ? Number(String(formPesoLiquido).replace(',', '.')) || 0 : 0,
      quantidadeVolumes: formQtdVolumes ? parseInt(formQtdVolumes, 10) || 0 : 0,
      especieVolumes: formEspecieVolumes || 'VOLUMES',
      payload: payloadJson,
      items: items.map((it) => ({
        produto_id: it.produto_id,
        descricao: it.produto_nome,
        unidade: it.unidade,
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
        valor_desconto: it.valor_desconto,
        ncm: it.ncm || null,
        cfop: it.cfop || null,
        cst: it.cst || null,
        csosn: it.csosn || null,
        informacoes_adicionais: it.informacoes_adicionais || null,
        codigo_beneficio_fiscal: it.codigo_beneficio_fiscal || null,
      })),
    });

    if (!emissaoId) throw new Error('Falha ao persistir rascunho (sem id).');
    return emissaoId;
  };

  const newId = () => {
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID() as string;
    return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  // Build TaxContext from current state
  const buildTaxCtx = useCallback(() => {
    if (emitenteCrt === null) return null;
    return {
      isRegimeNormal: emitenteCrt === 3,
      isIntrastate: !!(emitenteUf && destinatarioUf && emitenteUf.toUpperCase() === destinatarioUf.toUpperCase()),
    };
  }, [emitenteCrt, emitenteUf, destinatarioUf]);

  // Recalc impostos for all items (used when natureza or destinatário changes)
  const recalcAllItemImpostos = useCallback((natCfg?: NaturezaFiscalConfig | null) => {
    const nat = natCfg ?? naturezaConfig;
    if (!nat) return;
    const ctx = buildTaxCtx();
    if (!ctx) return;
    setItems(prev => prev.map(it => {
      const result = calculateItemTax(
        { quantidade: it.quantidade, valor_unitario: it.valor_unitario, valor_desconto: it.valor_desconto },
        nat, ctx,
      );
      return {
        ...it,
        cfop: result.cfop || it.cfop,
        cst: result.cst || it.cst,
        csosn: result.csosn || it.csosn,
        codigo_beneficio_fiscal: result.codigo_beneficio_fiscal || it.codigo_beneficio_fiscal,
        impostos: result.impostos,
      };
    }));
  }, [naturezaConfig, buildTaxCtx]);

  const addItemFromProduct = async (productId: string, hit?: any) => {
    const nome = (hit?.nome || hit?.label || productToAddName || 'Produto').toString();
    const unidade = (hit?.unidade || 'un').toString();
    const preco = typeof hit?.preco_venda === 'number' ? hit.preco_venda : 0;

    let fiscalDefaults: any = {};
    try {
      const rows = await callRpc<Array<{ ncm: string | null; cfop_padrao: string | null; cst_padrao: string | null; csosn_padrao: string | null }>>(
        'produtos_fiscal_defaults_get_for_current_user',
        { p_id: productId }
      );
      fiscalDefaults = rows?.[0] || {};
    } catch {
      fiscalDefaults = {};
    }

    const newItem: NfeItemForm = {
      id: newId(),
      produto_id: productId,
      produto_nome: nome,
      unidade,
      quantidade: 1,
      valor_unitario: Number.isFinite(preco) ? preco : 0,
      valor_desconto: 0,
      ncm: (fiscalDefaults?.ncm ?? '').toString(),
      cfop: (fiscalDefaults?.cfop_padrao ?? '').toString(),
      cst: (fiscalDefaults?.cst_padrao ?? '').toString(),
      csosn: (fiscalDefaults?.csosn_padrao ?? '').toString(),
      informacoes_adicionais: '',
      codigo_beneficio_fiscal: '',
    };

    // Auto-calculate taxes if natureza is selected
    if (naturezaConfig) {
      const ctx = buildTaxCtx();
      if (ctx) {
        const result = calculateItemTax(
          { quantidade: newItem.quantidade, valor_unitario: newItem.valor_unitario, valor_desconto: newItem.valor_desconto },
          naturezaConfig, ctx,
        );
        newItem.cfop = result.cfop || newItem.cfop;
        newItem.cst = result.cst || newItem.cst;
        newItem.csosn = result.csosn || newItem.csosn;
        newItem.codigo_beneficio_fiscal = result.codigo_beneficio_fiscal || newItem.codigo_beneficio_fiscal;
        newItem.impostos = result.impostos;
      }
    }

    setItems((prev) => [...prev, newItem]);
    setProductToAddId(null);
    setProductToAddName(undefined);
  };

  const updateItem = (id: string, patch: Partial<NfeItemForm>) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const updated = { ...it, ...patch };
      // Recalc impostos if value-affecting fields changed
      const valueChanged = 'quantidade' in patch || 'valor_unitario' in patch || 'valor_desconto' in patch;
      if (valueChanged && naturezaConfig) {
        const ctx = buildTaxCtx();
        if (ctx) {
          const result = calculateItemTax(
            { quantidade: updated.quantidade, valor_unitario: updated.valor_unitario, valor_desconto: updated.valor_desconto },
            naturezaConfig, ctx,
          );
          updated.impostos = result.impostos;
        }
      }
      return updated;
    }));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleModeChange = (m: NfeMode) => {
    setNfeModeState(m);
    setNfeMode(m);
  };

  const handleRecalcularImpostos = async () => {
    if (!editing?.id) return;
    setRecalculating(true);
    try {
      const res = await fiscalNfeCalcularImpostos(editing.id);
      if (res && res.ok) {
        addToast(`Impostos recalculados (${res.items_calculated} itens).`, 'success');
        // Reload items to show updated impostos
        const data = await fiscalNfeEmissaoItensList(editing.id);
        if (data) {
          setItems(data.map((it: any) => ({
            id: it.id,
            produto_id: it.produto_id,
            produto_nome: it.descricao,
            unidade: it.unidade,
            quantidade: it.quantidade,
            valor_unitario: it.valor_unitario,
            valor_desconto: it.valor_desconto,
            ncm: it.ncm || '',
            cfop: it.cfop || '',
            cst: it.cst || '',
            csosn: it.csosn || '',
            informacoes_adicionais: it.informacoes_adicionais || '',
            codigo_beneficio_fiscal: it.codigo_beneficio_fiscal || '',
            impostos: it.impostos || null,
          })));
        }
      } else {
        addToast('Erro ao recalcular impostos.', 'error');
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao recalcular impostos.', 'error');
    } finally {
      setRecalculating(false);
    }
  };

  const handleSave = async () => {
    if (!empresaId) return;
    const local = validateDraftLocal();
    if (!local.ok) {
      addToast('Revise o rascunho: há campos obrigatórios pendentes.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const emissaoId = await persistDraft();

      // Auto-gerar duplicatas se condição de pagamento definida
      if (formCondicaoPagamentoId) {
        try {
          await fiscalNfeGerarDuplicatas(emissaoId);
        } catch {
          // Não bloqueia o save se gerar duplicatas falhar
        }
      }

      addToast(editing?.id ? 'Rascunho atualizado.' : 'Rascunho criado.', 'success');

      closeModal();
      await fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar rascunho.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewXml = async () => {
    if (!empresaId) return;

    const local = validateDraftLocal();
    if (!local.ok) {
      setPreviewOpen(true);
      setPreviewLoading(false);
      setPreviewErrors(local.errors);
      setPreviewWarnings([]);
      setPreviewXml('');
      addToast('Preview não gerado: corrija os erros do rascunho.', 'warning');
      return;
    }

    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewErrors([]);
    setPreviewWarnings([]);
    setPreviewXml('');

    try {
      const emissaoId = await persistDraft();
      const results = await callRpc<any[]>('fiscal_nfe_preview_xml', { p_emissao_id: emissaoId });

      const row = Array.isArray(results) ? results[0] : results;
      const ok = !!row?.ok;
      const errs: string[] = Array.isArray(row?.errors) ? row.errors : [];
      const warns: string[] = Array.isArray(row?.warnings) ? row.warnings : [];
      setPreviewErrors(errs);
      setPreviewWarnings(warns);
      setPreviewXml((row?.xml || '').toString());

      if (!ok) {
        if (errs.length > 0) {
          addToast(`Preview não gerado:\n${errs.map(e => `• ${e}`).join('\n')}`, 'error');
        } else {
          addToast('Preview não gerado: corrija os erros e tente novamente.', 'error');
        }
      } else {
        addToast('Preview gerado (XML).', 'success');
      }
    } catch (e: any) {
      setPreviewErrors([e?.message || 'Erro ao gerar preview.']);
      addToast(e?.message || 'Erro ao gerar preview.', 'error');
    } finally {
      setPreviewLoading(false);
      await fetchList();
    }
  };

  const handleSubmitNfe = async (emissaoId: string) => {
    if (!features.nfe_emissao_enabled) {
      addToast('Emissao de NF-e esta desativada. Ative nas Configuracoes.', 'error');
      return;
    }
    setSubmitting(emissaoId);
    try {
      const result = await fiscalNfeSubmit(emissaoId);
      if (result.ok) {
        addToast(`NF-e enviada com sucesso. Status: ${result.status || 'processando'}`, 'success');
      } else {
        // Parse field-level errors from Focus response
        const erros = result.focus_response?.erros;
        if (result.error === 'EMITENTE_NOT_CONFIGURED') {
          addToast('Emitente não configurado. Configure em Fiscal → Configurações antes de emitir.', 'error');
          navigate('/app/fiscal/nfe/configuracoes');
        } else if (result.error === 'DESTINATARIO_INCOMPLETO') {
          addToast(result.detail || 'Cadastro do destinatário incompleto.', 'error');
        } else if (Array.isArray(erros) && erros.length > 0) {
          const lines = erros.map((e: any) => `• ${e.campo}: ${e.mensagem}`).join('\n');
          addToast(`Erro de validação NF-e:\n${lines}`, 'error');
        } else {
          addToast(`Erro ao enviar NF-e: ${result.detail || result.error || 'Erro desconhecido'}`, 'error');
        }
      }
      void fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao enviar NF-e.', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const copyChave = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast('Chave copiada.', 'success');
    } catch {
      addToast('Não foi possível copiar a chave.', 'error');
    }
  };

  const openDocument = async (emissaoId: string, type: 'danfe' | 'xml') => {
    setFetchingDoc(`${emissaoId}-${type}`);
    try {
      const result = await fiscalNfeFetchDocument(emissaoId, type);
      if (result.ok) {
        if (type === 'xml') {
          // Force download instead of opening in browser
          const a = document.createElement('a');
          a.href = result.url;
          a.download = `nfe-${emissaoId}.xml`;
          a.target = '_blank';
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          window.open(result.url, '_blank');
        }
      } else {
        addToast(result.error || 'Erro ao buscar documento.', 'error');
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao buscar documento.', 'error');
    } finally {
      setFetchingDoc(null);
    }
  };

  const openAudit = async (emissaoId: string) => {
    setAuditEmissaoId(emissaoId);
    setAuditOpen(true);
    setAuditLoading(true);
    setAuditItems([]);
    try {
      const data = await fiscalNfeAuditTimelineList(emissaoId, { limit: 200 });
      setAuditItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar auditoria.', 'error');
      setAuditItems([]);
    } finally {
      setAuditLoading(false);
    }
  };

  if (!canShow) {
    return (
      <div className="p-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-700">Selecione uma empresa ativa para visualizar as NF-e.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-1">
      <div className="mb-6">
        <PageHeader
          title="NF-e (Pré-NF-e e Histórico)"
          description="Crie Pré-NF-e, calcule impostos com o motor fiscal e envie para autorização."
          icon={<Receipt size={20} />}
          actions={
            <>
              <Link to="/app/fiscal/nfe/configuracoes">
                <Button variant="secondary">
                  <Settings size={18} />
                  <span className="ml-2">Configurações</span>
                </Button>
              </Link>
              <Button onClick={openNew}>
                <Plus size={18} />
                <span className="ml-2">Nova Pré-NF-e</span>
              </Button>
            </>
          }
        />
      </div>

      {!features.nfe_emissao_enabled && (
        <div className="mb-4">
          <GlassCard className="p-4 border border-amber-200 bg-amber-50/60">
            <p className="text-sm text-amber-900">
              Emissão está <span className="font-semibold">desativada</span>. Você pode preparar rascunhos, mas não poderá enviar para autorização.
            </p>
          </GlassCard>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
          <p className="text-xs text-slate-700 font-semibold">Total</p>
          <p className="text-2xl font-bold text-slate-800">{totals.total}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs text-indigo-700 font-semibold">Rascunhos</p>
          <p className="text-2xl font-bold text-indigo-800">{totals.rascunhos}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-xs text-emerald-700 font-semibold">Autorizadas</p>
          <p className="text-2xl font-bold text-emerald-800">{totals.autorizadas}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs text-amber-700 font-semibold">Pendentes</p>
          <p className="text-2xl font-bold text-amber-800">{totals.pendentes}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs text-red-700 font-semibold">Rejeitadas / Erro</p>
          <p className="text-2xl font-bold text-red-800">{totals.rejeitadasErro}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-700 font-semibold">Valor Autorizado</p>
          <p className="text-xl font-bold text-green-800 truncate">{formatCurrency(totals.totalAutorizadasValor)}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por número, série, chave ou status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[220px]">
          <option value="">Todos os status</option>
          <option value="rascunho">Pré-NF-e</option>
          <option value="em_composicao">Em Composição</option>
          <option value="aguardando_validacao">Aguardando Validação</option>
          <option value="com_pendencias">Com Pendências</option>
          <option value="pronta">Pronta p/ Emissão</option>
          <option value="enfileirada">Enfileirada</option>
          <option value="processando">Processando</option>
          <option value="autorizada">Autorizada</option>
          <option value="rejeitada">Rejeitada</option>
          <option value="cancelada">Cancelada</option>
          <option value="erro">Erro</option>
        </Select>
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          title="Data de emissão: início"
          className="p-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          title="Data de emissão: fim"
          className="p-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          title="Exportar lista atual como CSV (abre corretamente no Excel)"
          className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <Download size={16} />
          Exportar CSV
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-semibold text-blue-800">{selectedCount} selecionada(s)</span>
          <button
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50"
            onClick={() => setShowBulkDeleteConfirm(true)}
            disabled={bulkDeleting}
          >
            <Trash2 size={14} />
            Excluir selecionadas
          </button>
          <button
            className="text-sm text-blue-600 hover:text-blue-800 underline"
            onClick={() => setSelected(new Set())}
          >
            Limpar seleção
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="h-56 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-center text-gray-500 p-4">
            <Receipt size={48} className="mb-3" />
            <p className="font-semibold text-lg">Nenhuma NF-e encontrada.</p>
            <p className="text-sm">Crie um rascunho para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <TableColGroup columns={columns} widths={widths} />
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 w-12">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={deletableRows.length > 0 && selected.size === deletableRows.length}
                      onChange={toggleSelectAll}
                      title="Selecionar todos os deletáveis"
                    />
                  </th>
                  <ResizableSortableTh columnId="status" label="Status" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="destinatario" label="Destinatário" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="natureza" label="Nat. Operação" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="numero_serie" label="Nº / Série" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="ambiente" label="Ambiente" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="valor" label="Valor" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="atualizado" label="Atualizado" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="acao" label="Ação" align="right" sortable={false} resizable onResizeStart={startResize as any} />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedRows.map((row) => {
                  const isDeletable = DELETABLE_STATUSES.includes(row.status);
                  return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-3 py-4 w-12">
                      {isDeletable ? (
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                        />
                      ) : <span className="block w-4" />}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-1">
                        {row.status === 'processando' && !isProcessandoStale(row) && <Loader2 size={12} className="animate-spin text-amber-600" />}
                        {row.status === 'processando' && isProcessandoStale(row) && <AlertTriangle size={12} className="text-amber-600" />}
                        <NfeStatusBadge status={row.status} />
                      </div>
                      {(row.rejection_code || row.last_error) ? (
                        <RejectionCard
                          code={row.rejection_code}
                          lastError={row.last_error}
                          reprocessCount={row.reprocess_count}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700 max-w-[200px] truncate" title={row.destinatario_nome ?? ''}>
                      {row.destinatario_nome || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700 max-w-[180px] truncate" title={row.natureza_operacao ?? ''}>
                      {row.natureza_operacao || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">
                      {row.numero != null ? row.numero : '—'} / {row.serie != null ? row.serie : '—'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {row.ambiente === 'producao' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">Produção</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Homologação</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 font-semibold">
                      {formatCurrency(row.total_nfe ?? row.valor_total)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(row.updated_at)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {isDeletable ? (
                          <button className="text-blue-600 hover:text-blue-900 text-sm font-semibold" onClick={() => void openEdit(row)} title="Abrir rascunho">
                            Abrir
                          </button>
                        ) : null}
                        {isDeletable && features.nfe_emissao_enabled ? (
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                            onClick={() => void handleSubmitNfe(row.id)}
                            disabled={submitting === row.id}
                            title="Enviar para SEFAZ via Focus NF-e"
                          >
                            {submitting === row.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            Enviar
                          </button>
                        ) : null}
                        {row.status === 'processando' ? (
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200"
                            title="Verificar status agora"
                            onClick={() => void fiscalNfeConsultaStatus(row.id).then(() => fetchList())}
                          >
                            <Search size={14} />
                            Verificar
                          </button>
                        ) : null}
                        <button
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                          onClick={() => void openAudit(row.id)}
                          title="Auditoria"
                        >
                          <Eye size={14} />
                        </button>
                        {row.chave_acesso ? (
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                            onClick={() => void copyChave(row.chave_acesso!)}
                            title="Copiar chave de acesso"
                          >
                            <Copy size={14} />
                          </button>
                        ) : null}
                        {['autorizada', 'cancelada'].includes(row.status) ? (
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-100 text-indigo-800 hover:bg-indigo-200 disabled:opacity-50"
                            title="Visualizar DANFE (PDF)"
                            disabled={fetchingDoc === `${row.id}-danfe`}
                            onClick={() => void openDocument(row.id, 'danfe')}
                          >
                            {fetchingDoc === `${row.id}-danfe` ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                            DANFE
                          </button>
                        ) : null}
                        {['autorizada', 'cancelada'].includes(row.status) ? (
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                            title="Download XML"
                            disabled={fetchingDoc === `${row.id}-xml`}
                            onClick={() => void openDocument(row.id, 'xml')}
                          >
                            {fetchingDoc === `${row.id}-xml` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            XML
                          </button>
                        ) : null}
                        {row.status === 'autorizada' ? (
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200"
                            onClick={() => { setCancelTarget(row); setCancelJust(''); }}
                            title="Cancelar NF-e junto à SEFAZ"
                          >
                            <Ban size={14} />
                            Cancelar
                          </button>
                        ) : null}
                        {isDeletable ? (
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100"
                            onClick={() => setDeleteTarget(row)}
                            title="Excluir NF-e"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Editar Pré-NF-e' : 'Nova Pré-NF-e'} size="80pct">
        <div className="p-6 space-y-6">
          {draftErrors.length ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-sm font-semibold text-red-800">Revise o rascunho</div>
              <ul className="mt-2 list-disc list-inside text-sm text-red-700 space-y-1">
                {draftErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Ambiente</label>
              <Select value={formAmbiente} onChange={(e) => setFormAmbiente(e.target.value as AmbienteNfe)} className="min-w-[220px]">
                <option value="homologacao">Homologação</option>
                <option value="producao">Produção</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Natureza da operação</label>
              <NaturezaOperacaoAutocomplete
                value={formNaturezaOperacaoId}
                initialName={formNaturezaOperacaoName}
                onChange={(id, hit) => {
                  setFormNaturezaOperacaoId(id);
                  if (hit) {
                    setFormNaturezaOperacao(hit.descricao);
                    setFormNaturezaOperacaoName(hit.descricao);
                    // Store full natureza config and auto-calc taxes on all items
                    const natCfg: NaturezaFiscalConfig = {
                      cfop_dentro_uf: hit.cfop_dentro_uf,
                      cfop_fora_uf: hit.cfop_fora_uf,
                      icms_cst: hit.icms_cst,
                      icms_csosn: hit.icms_csosn,
                      icms_aliquota: hit.icms_aliquota,
                      icms_reducao_base: hit.icms_reducao_base,
                      codigo_beneficio_fiscal: hit.codigo_beneficio_fiscal,
                      pis_cst: hit.pis_cst,
                      pis_aliquota: hit.pis_aliquota,
                      cofins_cst: hit.cofins_cst,
                      cofins_aliquota: hit.cofins_aliquota,
                      ipi_cst: hit.ipi_cst,
                      ipi_aliquota: hit.ipi_aliquota,
                    };
                    setNaturezaConfig(natCfg);
                    recalcAllItemImpostos(natCfg);
                  } else {
                    setFormNaturezaOperacao('');
                    setFormNaturezaOperacaoName(undefined);
                    setNaturezaConfig(null);
                  }
                }}
                placeholder="Buscar natureza..."
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Frete (opcional)</label>
              <input
                value={formFrete}
                onChange={(e) => setFormFrete(e.target.value)}
                placeholder="Ex.: 25,00"
                className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Forma de pagamento</label>
              <Select value={formFormaPagamento} onChange={(e) => setFormFormaPagamento(e.target.value)}>
                <option value="">Selecione...</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cheque">Cheque</option>
                <option value="cartao_credito">Cartão de Crédito</option>
                <option value="cartao_debito">Cartão de Débito</option>
                <option value="boleto">Boleto</option>
                <option value="pix">PIX</option>
                <option value="deposito">Depósito</option>
                <option value="transferencia">Transferência</option>
                <option value="sem_pagamento">Sem Pagamento</option>
                <option value="outros">Outros</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Modalidade frete</label>
              <Select value={formModalidadeFrete} onChange={(e) => setFormModalidadeFrete(e.target.value)}>
                <option value="9">9 — Sem frete</option>
                <option value="0">0 — Emitente (CIF)</option>
                <option value="1">1 — Destinatário (FOB)</option>
                <option value="2">2 — Terceiros</option>
                <option value="3">3 — Próprio remetente</option>
                <option value="4">4 — Próprio destinatário</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Condição de pagamento</label>
              <div className="relative">
                <Select
                  value={formCondicaoPagamentoId ?? ''}
                  onChange={async (e) => {
                    const id = e.target.value || null;
                    setFormCondicaoPagamentoId(id);
                    const hit = condicaoHits.find((c) => c.id === id);
                    setFormCondicaoPagamentoNome(hit?.nome ?? '');
                  }}
                >
                  <option value="">Selecione...</option>
                  {condicaoHits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.condicao})
                    </option>
                  ))}
                </Select>
                {condicaoLoading && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2">
                    <Loader2 className="animate-spin text-slate-400" size={14} />
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Gera duplicatas automaticamente ao salvar.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Transportadora</label>
              <div className="relative">
                <Select
                  value={formTransportadoraId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    setFormTransportadoraId(id);
                    const hit = transportadoraHits.find((t) => t.id === id);
                    setFormTransportadoraNome(hit?.nome ?? '');
                  }}
                >
                  <option value="">Nenhuma (sem transportadora)</option>
                  {transportadoraHits.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}{t.documento ? ` — ${t.documento}` : ''}{t.cidade ? ` (${t.cidade}/${t.uf})` : ''}
                    </option>
                  ))}
                </Select>
                {transportadoraLoading && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2">
                    <Loader2 className="animate-spin text-slate-400" size={14} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Peso / Volumes</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Peso bruto (kg)</label>
                  <input
                    type="text"
                    value={formPesoBruto}
                    onChange={(e) => setFormPesoBruto(e.target.value)}
                    placeholder="0,000"
                    className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Peso líquido (kg)</label>
                  <input
                    type="text"
                    value={formPesoLiquido}
                    onChange={(e) => setFormPesoLiquido(e.target.value)}
                    placeholder="0,000"
                    className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Qtd volumes</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={formQtdVolumes}
                    onChange={(e) => setFormQtdVolumes(e.target.value)}
                    placeholder="0"
                    className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Espécie</label>
                  <input
                    type="text"
                    value={formEspecieVolumes}
                    onChange={(e) => setFormEspecieVolumes(e.target.value.toUpperCase())}
                    placeholder="VOLUMES"
                    className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            {duplicatasPreview.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs text-amber-800 font-semibold mb-1">Duplicatas ({duplicatasPreview.length})</div>
                <div className="space-y-0.5">
                  {duplicatasPreview.map((d, i) => (
                    <div key={i} className="text-xs text-amber-700 flex justify-between gap-2">
                      <span>{d.numero} — {new Date(d.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                      <span className="font-semibold">{formatCurrency(d.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="md:col-span-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-600 font-semibold">Totais (prévia)</div>
              <div className="mt-2 space-y-1 text-sm text-slate-800">
                <div className="flex items-center justify-between gap-4">
                  <span>Produtos</span>
                  <span className="font-semibold">{formatCurrency(totalsDraft.total_produtos)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Descontos</span>
                  <span className="font-semibold">{formatCurrency(totalsDraft.total_descontos)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Frete</span>
                  <span className="font-semibold">{formatCurrency(totalsDraft.frete)}</span>
                </div>
                {totalsDraft.total_impostos > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span>Impostos (IPI)</span>
                    <span className="font-semibold">{formatCurrency(totalsDraft.total_impostos)}</span>
                  </div>
                )}
                <div className="pt-2 mt-2 border-t border-slate-200 flex items-center justify-between gap-4">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold">{formatCurrency(totalsDraft.total_nfe)}</span>
                </div>
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Destinatário (cliente)</label>
              <ClientAutocomplete
                value={formDestinatarioId}
                initialName={formDestinatarioName}
                onChange={async (id, name) => {
                  setFormDestinatarioId(id);
                  setFormDestinatarioName(name);
                  if (id) {
                    const uf = await getPartnerPrimaryUf(id).catch(() => null);
                    setDestinatarioUf(uf);
                  } else {
                    setDestinatarioUf(null);
                  }
                }}
                placeholder="Nome/CPF/CNPJ..."
              />
              <p className="text-xs text-slate-500 mt-2">
                NFE-03: CFOP/CST/CSOSN podem ser preenchidos por item; defaults podem vir do cadastro do produto.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Itens</h3>
                <p className="text-xs text-slate-500 mt-1">Adicione produtos e ajuste quantidade/valor. Use "Recalcular" para aplicar regras fiscais automaticamente.</p>
              </div>
              <div className="flex items-center gap-3">
                <NfeModeToggle mode={nfeMode} onChange={handleModeChange} />
                {editing?.id && items.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRecalcularImpostos}
                    disabled={recalculating || saving}
                    title="Recalcula CFOP, CST e alíquotas usando o motor fiscal v2 (natureza → regra fiscal → produto → manual)"
                  >
                    {recalculating ? <Loader2 size={14} className="animate-spin mr-1" /> : <Calculator size={14} className="mr-1" />}
                    Recalcular
                  </Button>
                )}
                <span className="text-xs text-slate-500">
                  {items.length} {items.length === 1 ? 'item' : 'itens'}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Adicionar produto</label>
                <ProductAutocomplete
                  value={productToAddId}
                  initialName={productToAddName}
                  onChange={(id, hit) => {
                    setProductToAddId(id);
                    setProductToAddName(hit?.nome);
                    if (id) void addItemFromProduct(id, hit);
                  }}
                  placeholder="Buscar produto..."
                />
              </div>
              <div className="text-xs text-slate-500">
                Dica: digite 2+ caracteres.
              </div>
            </div>

            <div className="mt-4 overflow-auto border border-gray-200 rounded-xl bg-white">
              <table className="min-w-[1440px] w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left p-3 min-w-[320px]">Produto</th>
                    <th className="text-left p-3 min-w-[90px]">Un</th>
                    <th className="text-left p-3 min-w-[110px]">NCM</th>
                    <th className="text-left p-3 min-w-[90px]">CFOP</th>
                    <th className="text-left p-3 min-w-[90px]">CST</th>
                    <th className="text-left p-3 min-w-[110px]">CSOSN</th>
                    <th className="text-left p-3 min-w-[120px]">cBenef</th>
                    <th className="text-right p-3 min-w-[110px]">Qtd</th>
                    <th className="text-right p-3 min-w-[140px]">Vlr Unit</th>
                    <th className="text-right p-3 min-w-[140px]">Desconto</th>
                    <th className="text-right p-3 min-w-[140px]">Total</th>
                    <th className="text-right p-3 min-w-[90px]">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 ? (
                    <tr>
                      <td className="p-4 text-gray-500" colSpan={12}>
                        Nenhum item ainda. Use “Adicionar produto”.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const totalLine = Math.max(0, it.quantidade * it.valor_unitario - (it.valor_desconto || 0));
                      return (
                        <React.Fragment key={it.id}>
                        <tr className="hover:bg-gray-50/40">
                          <td className="p-3">
                            <input
                              value={it.produto_nome}
                              onChange={(e) => updateItem(it.id, { produto_nome: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="Descrição do item"
                            />
                          </td>
                          <td className="p-3">
                            <UnidadeMedidaSelect
                              label={null}
                              name={`unidade_${it.id}`}
                              uiSize="sm"
                              value={it.unidade}
                              onChange={(sigla) => updateItem(it.id, { unidade: sigla || '' })}
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.ncm}
                              onChange={(e) => updateItem(it.id, { ncm: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="00000000"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.cfop}
                              onChange={(e) => updateItem(it.id, { cfop: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="0000"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.cst}
                              onChange={(e) => updateItem(it.id, { cst: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="00"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.csosn}
                              onChange={(e) => updateItem(it.id, { csosn: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="000"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.codigo_beneficio_fiscal}
                              onChange={(e) => updateItem(it.id, { codigo_beneficio_fiscal: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="Ex: SP000202"
                              maxLength={10}
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min={0}
                              step={0.0001}
                              value={String(it.quantidade)}
                              onChange={(e) => updateItem(it.id, { quantidade: Number(e.target.value) || 0 })}
                              className="w-full text-right border border-gray-200 rounded-lg px-3 py-2"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min={0}
                              step={0.0001}
                              value={String(it.valor_unitario)}
                              onChange={(e) => updateItem(it.id, { valor_unitario: Number(e.target.value) || 0 })}
                              className="w-full text-right border border-gray-200 rounded-lg px-3 py-2"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min={0}
                              step={0.0001}
                              value={String(it.valor_desconto)}
                              onChange={(e) => updateItem(it.id, { valor_desconto: Number(e.target.value) || 0 })}
                              className="w-full text-right border border-gray-200 rounded-lg px-3 py-2"
                            />
                          </td>
                          <td className="p-3 text-right font-semibold">{formatCurrency(totalLine)}</td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(it.id)}
                              className="text-sm font-semibold text-red-600 hover:text-red-700"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                        <tr className="bg-slate-50/30">
                          <td colSpan={12} className="px-3 pb-2 pt-0">
                            <input
                              value={it.informacoes_adicionais}
                              onChange={(e) => updateItem(it.id, { informacoes_adicionais: e.target.value })}
                              className="w-full border border-gray-100 rounded-lg px-3 py-1.5 text-xs text-slate-600 bg-white"
                              placeholder="Informações adicionais do item (infAdProd) — ex: xPed, lote, validade..."
                            />
                          </td>
                        </tr>
                        {it.impostos?.icms && it.impostos?.pis && it.impostos?.cofins && (
                          <tr className="bg-blue-50/30">
                            <td colSpan={12} className="px-3 pb-2 pt-0.5">
                              <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                <span className="inline-flex items-center gap-1">
                                  <span className="font-semibold text-slate-600">ICMS</span>
                                  <span>{it.impostos.icms.aliquota ?? 0}%</span>
                                  <span className="text-slate-400">=</span>
                                  <span className="font-semibold text-slate-700">{formatCurrency(it.impostos.icms.valor ?? 0)}</span>
                                </span>
                                <span className="text-slate-300">|</span>
                                <span className="inline-flex items-center gap-1">
                                  <span className="font-semibold text-slate-600">PIS</span>
                                  <span>{it.impostos.pis.aliquota ?? 0}%</span>
                                  <span className="text-slate-400">=</span>
                                  <span className="font-semibold text-slate-700">{formatCurrency(it.impostos.pis.valor ?? 0)}</span>
                                </span>
                                <span className="text-slate-300">|</span>
                                <span className="inline-flex items-center gap-1">
                                  <span className="font-semibold text-slate-600">COFINS</span>
                                  <span>{it.impostos.cofins.aliquota ?? 0}%</span>
                                  <span className="text-slate-400">=</span>
                                  <span className="font-semibold text-slate-700">{formatCurrency(it.impostos.cofins.valor ?? 0)}</span>
                                </span>
                                {it.impostos.ipi && (
                                  <>
                                    <span className="text-slate-300">|</span>
                                    <span className="inline-flex items-center gap-1">
                                      <span className="font-semibold text-slate-600">IPI</span>
                                      <span>{it.impostos.ipi.aliquota ?? 0}%</span>
                                      <span className="text-slate-400">=</span>
                                      <span className="font-semibold text-slate-700">{formatCurrency(it.impostos.ipi.valor ?? 0)}</span>
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={handlePreviewXml} disabled={saving}>
              <Eye size={18} />
              <span className="ml-2">Preview XML</span>
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={18} /> : null}
              <span className="ml-2">Salvar</span>
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview XML (NFE-02)" size="80pct">
        <div className="p-6 space-y-4">
          {previewLoading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="animate-spin text-blue-600" size={28} />
            </div>
          ) : (
            <>
              {previewErrors.length > 0 ? (
                <GlassCard className="p-4 border border-rose-200 bg-rose-50/60">
                  <div className="text-sm font-semibold text-rose-900">Erros</div>
                  <ul className="mt-2 text-sm text-rose-900 list-disc pl-5 space-y-1">
                    {previewErrors.map((e, idx) => (
                      <li key={idx}>{e}</li>
                    ))}
                  </ul>
                </GlassCard>
              ) : null}

              {previewWarnings.length > 0 ? (
                <GlassCard className="p-4 border border-amber-200 bg-amber-50/60">
                  <div className="text-sm font-semibold text-amber-900">Avisos</div>
                  <ul className="mt-2 text-sm text-amber-900 list-disc pl-5 space-y-1">
                    {previewWarnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </GlassCard>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-800">XML (preview)</div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(previewXml || '');
                      addToast('XML copiado.', 'success');
                    } catch {
                      addToast('Não foi possível copiar.', 'error');
                    }
                  }}
                  disabled={!previewXml}
                >
                  <Copy size={18} />
                  <span className="ml-2">Copiar</span>
                </Button>
              </div>

              <pre className="text-xs whitespace-pre-wrap break-words p-4 rounded-xl border border-slate-200 bg-slate-50 max-h-[60vh] overflow-auto">
                {previewXml || '—'}
              </pre>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={auditOpen} onClose={() => setAuditOpen(false)} title="Observabilidade da NF-e (NFE-06)" size="80pct">
        <div className="p-6 space-y-4">
          {auditLoading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="animate-spin text-blue-600" size={28} />
            </div>
          ) : auditItems.length === 0 ? (
            <GlassCard className="p-4">
              <p className="text-sm text-slate-700">Sem eventos de auditoria para esta emissão.</p>
            </GlassCard>
          ) : (
            <div className="space-y-3">
              {auditItems.map((it, idx) => (
                <GlassCard key={idx} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{it?.message || it?.kind || 'Evento'}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {formatDate(it?.occurred_at)} • {it?.source || '—'}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(JSON.stringify(it?.payload ?? {}, null, 2));
                          addToast('Payload copiado.', 'success');
                        } catch {
                          addToast('Não foi possível copiar.', 'error');
                        }
                      }}
                    >
                      <Copy size={18} />
                      <span className="ml-2">Copiar</span>
                    </Button>
                  </div>
                  <pre className="mt-3 text-xs whitespace-pre-wrap break-words p-3 rounded-xl border border-slate-200 bg-slate-50 max-h-[40vh] overflow-auto">
                    {JSON.stringify(it?.payload ?? {}, null, 2)}
                  </pre>
                </GlassCard>
              ))}
            </div>
          )}
          {auditEmissaoId ? (
            <div className="flex items-center justify-end">
              <Button variant="secondary" onClick={() => void openAudit(auditEmissaoId!)}>
                <Search size={18} />
                <span className="ml-2">Recarregar</span>
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Delete single confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Excluir NF-e" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700">
            Deseja excluir esta NF-e ({deleteTarget?.destinatario_nome || 'sem destinatário'})? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
            <Button
              onClick={() => void handleDeleteSingle()}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? <Loader2 size={16} className="animate-spin mr-2" /> : <Trash2 size={16} className="mr-2" />}
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk delete confirmation */}
      <Modal isOpen={showBulkDeleteConfirm} onClose={() => setShowBulkDeleteConfirm(false)} title="Excluir NF-e em lote" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700">
            Deseja excluir <strong>{selectedCount}</strong> NF-e selecionada(s)? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleting}>Cancelar</Button>
            <Button
              onClick={() => void handleBulkDelete()}
              disabled={bulkDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {bulkDeleting ? <Loader2 size={16} className="animate-spin mr-2" /> : <Trash2 size={16} className="mr-2" />}
              Excluir {selectedCount}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel NF-e confirmation */}
      <Modal
        isOpen={!!cancelTarget}
        onClose={() => { if (!cancelling) { setCancelTarget(null); setCancelJust(''); } }}
        title={`Cancelar NF-e${cancelTarget?.numero ? ` nº ${cancelTarget.numero}` : ''}`}
        size="md"
      >
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-900">
              <AlertTriangle size={16} />
              Esta ação é irreversível
            </div>
            <p className="text-sm text-red-800">
              A NF-e será cancelada junto à SEFAZ. Após o cancelamento, o número não poderá ser reutilizado.
            </p>
          </div>

          {cancelTarget && (() => {
            const hoursAgo = (Date.now() - new Date(cancelTarget.created_at).getTime()) / (1000 * 60 * 60);
            return hoursAgo > 24 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <AlertTriangle size={16} />
                  NF-e autorizada há mais de 24 horas
                </div>
                <p className="text-sm text-amber-800 mt-1">
                  O cancelamento pode ser recusado pela SEFAZ. O prazo padrão é de 24 horas após a autorização.
                </p>
              </div>
            ) : null;
          })()}

          {cancelTarget ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-500">Número / Série:</span>{' '}
                <span className="font-semibold text-slate-900">{cancelTarget.numero ?? '—'} / {cancelTarget.serie ?? '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Valor:</span>{' '}
                <span className="font-semibold text-slate-900">{formatCurrency(cancelTarget.valor_total)}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Destinatário:</span>{' '}
                <span className="font-semibold text-slate-900">{cancelTarget.destinatario_nome || '—'}</span>
              </div>
              {cancelTarget.chave_acesso ? (
                <div className="col-span-2">
                  <span className="text-slate-500">Chave:</span>{' '}
                  <span className="font-mono text-xs text-slate-700">{cancelTarget.chave_acesso}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Justificativa <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              rows={3}
              maxLength={255}
              placeholder="Motivo do cancelamento (mínimo 15 caracteres)"
              value={cancelJust}
              onChange={(e) => setCancelJust(e.target.value)}
              disabled={cancelling}
            />
            <div className="text-xs text-slate-400 text-right mt-1">{cancelJust.length}/255</div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => { setCancelTarget(null); setCancelJust(''); }}
              disabled={cancelling}
            >
              Voltar
            </Button>
            <Button
              onClick={() => void handleCancelNfe()}
              disabled={cancelling || cancelJust.trim().length < 15}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelling ? <Loader2 size={16} className="animate-spin mr-2" /> : <Ban size={16} className="mr-2" />}
              Cancelar NF-e
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
