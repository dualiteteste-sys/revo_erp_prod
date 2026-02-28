import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { Copy, Eye, Loader2, Plus, Receipt, Search, Send, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ProductAutocomplete from '@/components/common/ProductAutocomplete';
import UnidadeMedidaSelect from '@/components/common/UnidadeMedidaSelect';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import {
  fiscalNfeAuditTimelineList,
  fiscalNfeEmissaoDraftUpsert,
  fiscalNfeEmissaoItensList,
  fiscalNfeEmissoesList,
  fiscalNfeSubmit,
} from '@/services/fiscalNfeEmissoes';
import { callRpc } from '@/lib/api';

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
  ambiente: AmbienteNfe;
  payload: any;
  last_error: string | null;
  created_at: string;
  updated_at: string;
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
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enfileirada: 'Enfileirada',
  processando: 'Processando',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
  erro: 'Erro',
};

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

export default function NfeEmissoesPage() {
  const supabase = useSupabase() as any;
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const features = useEmpresaFeatures();

  const empresaId = activeEmpresa?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
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
  const [sort, setSort] = useState<SortState<string>>({ column: 'atualizado', direction: 'desc' });

  const columns: TableColumnWidthDef[] = [
    { id: 'status', defaultWidth: 260, minWidth: 200 },
    { id: 'numero_serie', defaultWidth: 160, minWidth: 140 },
    { id: 'ambiente', defaultWidth: 140, minWidth: 120 },
    { id: 'valor', defaultWidth: 160, minWidth: 140 },
    { id: 'atualizado', defaultWidth: 220, minWidth: 180 },
    { id: 'acao', defaultWidth: 320, minWidth: 260 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'fiscal:nfe-emissoes', columns });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<NfeEmissao | null>(null);
  const [formAmbiente, setFormAmbiente] = useState<AmbienteNfe>('homologacao');
  const [formFrete, setFormFrete] = useState<string>('');
  const [formNaturezaOperacao, setFormNaturezaOperacao] = useState<string>('');
  const [formDestinatarioId, setFormDestinatarioId] = useState<string | null>(null);
  const [formDestinatarioName, setFormDestinatarioName] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<NfeItemForm[]>([]);
  const [productToAddId, setProductToAddId] = useState<string | null>(null);
  const [productToAddName, setProductToAddName] = useState<string | undefined>(undefined);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);

  const canShow = useMemo(() => !!empresaId, [empresaId]);

  const fetchList = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const data = await fiscalNfeEmissoesList({
        status: statusFilter || undefined,
        q: search.trim() || undefined,
        limit: 200,
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
        ambiente: (r.ambiente ?? 'homologacao') as AmbienteNfe,
        payload: r.payload ?? {},
        last_error: r.last_error ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

      setRows(list);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao listar NF-e.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, empresaId, search, statusFilter]);

  useEffect(() => {
    if (!empresaId) return;
    void fetchList();
  }, [empresaId, fetchList]);

  const totals = useMemo(() => {
    const total = rows.length;
    const rascunhos = rows.filter((r) => r.status === 'rascunho').length;
    const autorizadas = rows.filter((r) => r.status === 'autorizada').length;
    const pendentes = rows.filter((r) => ['enfileirada', 'processando'].includes(r.status)).length;
    return { total, rascunhos, autorizadas, pendentes };
  }, [rows]);

  const sortedRows = useMemo(() => {
    return sortRows(
      rows,
      sort as any,
      [
        { id: 'status', type: 'string', getValue: (r) => STATUS_LABEL[r.status] || r.status },
        { id: 'numero_serie', type: 'number', getValue: (r) => Number(r.numero ?? 0) * 1000 + Number(r.serie ?? 0) },
        { id: 'ambiente', type: 'string', getValue: (r) => r.ambiente ?? '' },
        { id: 'valor', type: 'number', getValue: (r) => Number(r.total_nfe ?? r.valor_total ?? 0) },
        { id: 'atualizado', type: 'date', getValue: (r) => r.updated_at ?? null },
      ] as const
    );
  }, [rows, sort]);

  const openNew = async () => {
    setEditing(null);
    setFormAmbiente('homologacao');
    setFormFrete('');
    setFormNaturezaOperacao('');
    setFormDestinatarioId(null);
    setFormDestinatarioName(undefined);
    setItems([]);
    setProductToAddId(null);
    setProductToAddName(undefined);
    setIsModalOpen(true);
  };

  const openEdit = async (row: NfeEmissao) => {
    setEditing(row);
    setFormAmbiente(row.ambiente || 'homologacao');
    setFormFrete(row.total_frete != null ? String(row.total_frete) : '');
    setFormNaturezaOperacao((row.natureza_operacao ?? '').toString());
    setFormDestinatarioId(row.destinatario_pessoa_id ?? null);
    setFormDestinatarioName(row.destinatario_nome ?? undefined);
    setProductToAddId(null);
    setProductToAddName(undefined);

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
    const total_nfe = Math.max(0, total_produtos - total_descontos + (Number.isFinite(frete) ? frete : 0));
    return { frete, total_produtos, total_descontos, total_nfe };
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
      totalFrete: frete,
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

    setItems((prev) => [
      ...prev,
      {
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
      },
    ]);
    setProductToAddId(null);
    setProductToAddName(undefined);
  };

  const updateItem = (id: string, patch: Partial<NfeItemForm>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
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
      await persistDraft();

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
      const { data, error } = await supabase.rpc('fiscal_nfe_preview_xml', { p_emissao_id: emissaoId });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const ok = !!row?.ok;
      const errs = (row?.errors || []) as string[];
      const warns = (row?.warnings || []) as string[];
      setPreviewErrors(errs);
      setPreviewWarnings(warns);
      setPreviewXml((row?.xml || '').toString());

      if (!ok) {
        addToast('Preview não gerado: corrija os erros e tente novamente.', 'error');
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
        addToast(`Erro ao enviar NF-e: ${result.detail || result.error || 'Erro desconhecido'}`, 'error');
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
          title="NF-e (Rascunhos e Histórico)"
          description="Crie rascunhos e prepare payloads. O envio/autorizar pode permanecer desativado até o go-live."
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
                <span className="ml-2">Novo rascunho</span>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
          <p className="text-xs text-slate-700 font-semibold">Total (últimos 200)</p>
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
      </div>

      <div className="mb-4 flex gap-4 items-center">
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
          <option value="rascunho">Rascunho</option>
          <option value="enfileirada">Enfileirada</option>
          <option value="processando">Processando</option>
          <option value="autorizada">Autorizada</option>
          <option value="rejeitada">Rejeitada</option>
          <option value="cancelada">Cancelada</option>
          <option value="erro">Erro</option>
        </Select>
      </div>

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
                  <ResizableSortableTh columnId="status" label="Status" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="numero_serie" label="Número/Série" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="ambiente" label="Ambiente" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="valor" label="Valor" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="atualizado" label="Atualizado" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="acao" label="Ação" align="right" sortable={false} resizable onResizeStart={startResize as any} />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <span className="font-semibold">{STATUS_LABEL[row.status] || row.status}</span>
                      {row.last_error ? <div className="text-xs text-red-600 mt-1">{row.last_error}</div> : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {row.numero != null ? row.numero : '—'} / {row.serie != null ? row.serie : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {row.ambiente === 'producao' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">Produção</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Homologação</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {formatCurrency(row.total_nfe ?? row.valor_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(row.updated_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        {['rascunho', 'erro', 'rejeitada'].includes(row.status) ? (
                          <button className="text-blue-600 hover:text-blue-900" onClick={() => void openEdit(row)} title="Abrir rascunho">
                            Abrir
                          </button>
                        ) : null}
                        {['rascunho', 'erro', 'rejeitada'].includes(row.status) && features.nfe_emissao_enabled ? (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                            onClick={() => void handleSubmitNfe(row.id)}
                            disabled={submitting === row.id}
                            title="Enviar para SEFAZ via Focus NF-e"
                          >
                            {submitting === row.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            Enviar SEFAZ
                          </button>
                        ) : null}
                        {row.status === 'processando' ? (
                          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-amber-100 text-amber-800">
                            <Loader2 size={16} className="animate-spin" />
                            Processando
                          </span>
                        ) : null}
                        <button
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                          onClick={() => void openAudit(row.id)}
                          title="Auditoria da NF-e"
                        >
                          <Search size={16} />
                          Auditoria
                        </button>
                        {row.chave_acesso ? (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                            onClick={() => void copyChave(row.chave_acesso!)}
                            title="Copiar chave de acesso"
                          >
                            <Copy size={16} />
                            Chave
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Editar rascunho NF-e' : 'Novo rascunho NF-e'} size="80pct">
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
              <input
                value={formNaturezaOperacao}
                onChange={(e) => setFormNaturezaOperacao(e.target.value)}
                placeholder="Ex.: Venda de mercadoria"
                className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                onChange={(id, name) => {
                  setFormDestinatarioId(id);
                  setFormDestinatarioName(name);
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
                <p className="text-xs text-slate-500 mt-1">Adicione produtos e ajuste quantidade/valor. Tributos serão calculados na etapa do motor fiscal.</p>
              </div>
              <div className="text-xs text-slate-500">
                {items.length} {items.length === 1 ? 'item' : 'itens'}
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
              <table className="min-w-[1320px] w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left p-3 min-w-[320px]">Produto</th>
                    <th className="text-left p-3 min-w-[90px]">Un</th>
                    <th className="text-left p-3 min-w-[110px]">NCM</th>
                    <th className="text-left p-3 min-w-[90px]">CFOP</th>
                    <th className="text-left p-3 min-w-[90px]">CST</th>
                    <th className="text-left p-3 min-w-[110px]">CSOSN</th>
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
                      <td className="p-4 text-gray-500" colSpan={11}>
                        Nenhum item ainda. Use “Adicionar produto”.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const totalLine = Math.max(0, it.quantidade * it.valor_unitario - (it.valor_desconto || 0));
                      return (
                        <tr key={it.id} className="hover:bg-gray-50/40">
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
    </div>
  );
}
