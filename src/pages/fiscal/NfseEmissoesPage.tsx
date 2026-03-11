import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import {
  Copy,
  Download,
  FileText,
  Loader2,
  Plus,
  Search,
  Send,
  Settings,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import {
  fiscalNfseEmissoesList,
  fiscalNfseDraftUpsert,
  fiscalNfseSubmit,
  fiscalNfseConsultaStatus,
} from '@/services/fiscalNfseEmissoes';
import type { NfseEmissaoRow, AmbienteNfse } from '@/services/fiscalNfseEmissoes';

// ── Helpers ──────────────────────────────────────────────────

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

function statusBadge(status: string) {
  const label = STATUS_LABEL[status] ?? status;
  const base = 'px-2 py-0.5 rounded-full text-xs font-semibold';
  switch (status) {
    case 'autorizada':
      return <span className={`${base} bg-emerald-100 text-emerald-800`}>{label}</span>;
    case 'rejeitada':
    case 'erro':
      return <span className={`${base} bg-red-100 text-red-800`}>{label}</span>;
    case 'cancelada':
      return <span className={`${base} bg-gray-200 text-gray-700`}>{label}</span>;
    case 'processando':
    case 'enfileirada':
      return <span className={`${base} bg-amber-100 text-amber-800`}>{label}</span>;
    default:
      return <span className={`${base} bg-indigo-100 text-indigo-800`}>{label}</span>;
  }
}

// ── Component ────────────────────────────────────────────────

export default function NfseEmissoesPage() {
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const empresaId = activeEmpresa?.id;

  // Data
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [rows, setRows] = useState<NfseEmissaoRow[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState<SortState<string>>({ column: 'atualizado', direction: 'desc' });

  // Table
  const columns: TableColumnWidthDef[] = [
    { id: 'status', defaultWidth: 200, minWidth: 160 },
    { id: 'numero', defaultWidth: 140, minWidth: 110 },
    { id: 'tomador', defaultWidth: 260, minWidth: 200 },
    { id: 'valor', defaultWidth: 160, minWidth: 130 },
    { id: 'ambiente', defaultWidth: 140, minWidth: 110 },
    { id: 'atualizado', defaultWidth: 200, minWidth: 160 },
    { id: 'acao', defaultWidth: 280, minWidth: 220 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'fiscal:nfse-emissoes', columns });

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<NfseEmissaoRow | null>(null);
  const [formAmbiente, setFormAmbiente] = useState<AmbienteNfse>('homologacao');
  const [formNaturezaOperacao, setFormNaturezaOperacao] = useState('Prestação de serviços');
  const [formTomadorId, setFormTomadorId] = useState<string | null>(null);
  const [formTomadorName, setFormTomadorName] = useState<string | undefined>(undefined);
  const [formDiscriminacao, setFormDiscriminacao] = useState('');
  const [formValorServicos, setFormValorServicos] = useState('');
  const [formIssRetido, setFormIssRetido] = useState(false);
  const [formAliquotaIss, setFormAliquotaIss] = useState('');
  const [formItemListaServico, setFormItemListaServico] = useState('');
  const [formCodigoMunicipio, setFormCodigoMunicipio] = useState('');
  const [draftErrors, setDraftErrors] = useState<string[]>([]);

  // ── Fetch ──────────────────────────────────────────────────

  const fetchList = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const result = await fiscalNfseEmissoesList({
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        pageSize: 200,
      });
      setRows(result?.rows ?? []);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao listar NFS-e.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, empresaId, search, statusFilter]);

  useEffect(() => {
    if (!empresaId) return;
    void fetchList();
  }, [empresaId, fetchList]);

  // Poll while any NFS-e is processando
  useEffect(() => {
    const hasProcessing = rows.some((r) => r.status === 'processando' || r.status === 'enfileirada');
    if (!hasProcessing) return;
    const timer = setInterval(async () => {
      for (const r of rows.filter((x) => x.status === 'processando' || x.status === 'enfileirada')) {
        try {
          await fiscalNfseConsultaStatus(r.id);
        } catch { /* ignore */ }
      }
      void fetchList();
    }, 5000);
    return () => clearInterval(timer);
  }, [rows, fetchList]);

  // ── Totals ─────────────────────────────────────────────────

  const totals = useMemo(() => {
    let rascunhos = 0, autorizadas = 0, pendentes = 0, totalAutorizadosValor = 0;
    for (const r of rows) {
      if (r.status === 'rascunho') rascunhos++;
      else if (r.status === 'autorizada') { autorizadas++; totalAutorizadosValor += r.valor_servicos ?? 0; }
      else if (['enfileirada', 'processando'].includes(r.status)) pendentes++;
    }
    return { total: rows.length, rascunhos, autorizadas, pendentes, totalAutorizadosValor };
  }, [rows]);

  // ── Sort & Filter ──────────────────────────────────────────

  const sortedRows = useMemo(() => {
    const mapped = rows.map((r) => ({
      ...r,
      _status: r.status,
      _numero: r.numero ?? 0,
      _tomador: r.tomador_nome ?? '',
      _valor: r.valor_servicos ?? 0,
      _ambiente: r.ambiente,
      _atualizado: r.updated_at,
    }));
    const colMap: Record<string, string> = {
      status: '_status',
      numero: '_numero',
      tomador: '_tomador',
      valor: '_valor',
      ambiente: '_ambiente',
      atualizado: '_atualizado',
    };
    return sortRows(mapped, { ...sort, column: colMap[sort.column] ?? sort.column });
  }, [rows, sort]);

  // ── Modal helpers ──────────────────────────────────────────

  function resetForm() {
    setEditing(null);
    setFormAmbiente('homologacao');
    setFormNaturezaOperacao('Prestação de serviços');
    setFormTomadorId(null);
    setFormTomadorName(undefined);
    setFormDiscriminacao('');
    setFormValorServicos('');
    setFormIssRetido(false);
    setFormAliquotaIss('');
    setFormItemListaServico('');
    setFormCodigoMunicipio('');
    setDraftErrors([]);
  }

  function openNew() {
    resetForm();
    setIsModalOpen(true);
  }

  function openEdit(row: NfseEmissaoRow) {
    setEditing(row);
    setFormAmbiente(row.ambiente);
    setFormNaturezaOperacao(row.natureza_operacao ?? 'Prestação de serviços');
    setFormTomadorId(row.tomador_pessoa_id);
    setFormTomadorName(row.tomador_nome ?? undefined);
    setFormDiscriminacao(row.discriminacao ?? '');
    setFormValorServicos(String(row.valor_servicos ?? ''));
    setFormIssRetido(row.iss_retido ?? false);
    setFormAliquotaIss(String(row.aliquota_iss ?? ''));
    setFormItemListaServico(row.item_lista_servico ?? '');
    setFormCodigoMunicipio(row.codigo_municipio ?? '');
    setDraftErrors([]);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    resetForm();
  }

  // ── Save Draft ─────────────────────────────────────────────

  async function handleSaveDraft() {
    const errors: string[] = [];
    if (!formTomadorId) errors.push('Selecione o tomador (cliente).');
    if (!formDiscriminacao.trim()) errors.push('Preencha a discriminação do serviço.');
    const valor = parseFloat(formValorServicos);
    if (!valor || valor <= 0) errors.push('Informe o valor dos serviços (> 0).');
    if (!formItemListaServico.trim()) errors.push('Informe o item da lista de serviço (LC 116).');
    if (!formCodigoMunicipio.trim()) errors.push('Informe o código IBGE do município.');
    if (errors.length) { setDraftErrors(errors); return; }

    setSaving(true);
    setDraftErrors([]);
    try {
      await fiscalNfseDraftUpsert({
        emissaoId: editing?.id ?? null,
        tomadorPessoaId: formTomadorId!,
        ambiente: formAmbiente,
        naturezaOperacao: formNaturezaOperacao,
        discriminacao: formDiscriminacao.trim(),
        valorServicos: valor,
        issRetido: formIssRetido,
        aliquotaIss: parseFloat(formAliquotaIss) || 0,
        itemListaServico: formItemListaServico.trim(),
        codigoMunicipio: formCodigoMunicipio.trim(),
      });
      addToast('Rascunho salvo.', 'success');
      closeModal();
      void fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar rascunho.', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────

  async function handleSubmit(id: string) {
    setSubmitting(id);
    try {
      const res = await fiscalNfseSubmit(id);
      if (res.ok || res.status === 'processando_autorizacao') {
        addToast('NFS-e enviada para autorização.', 'success');
      } else {
        addToast(res.detail || res.error || 'Erro ao submeter NFS-e.', 'error');
      }
      void fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao submeter NFS-e.', 'error');
    } finally {
      setSubmitting(null);
    }
  }

  // ── Copy / Download helpers ────────────────────────────────

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => addToast(`${label} copiado.`, 'success'),
      () => addToast('Falha ao copiar.', 'error'),
    );
  }

  // ── Render ─────────────────────────────────────────────────

  if (!empresaId) {
    return (
      <div className="p-8 text-center text-gray-500">Nenhuma empresa ativa. Selecione uma empresa.</div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="NFS-e (Notas Fiscais de Serviço)"
        description="Emissão e acompanhamento de NFS-e via Focus NFe."
        icon={<FileText size={20} />}
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

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-700 font-semibold">Valor Autorizado</p>
          <p className="text-xl font-bold text-green-800 truncate">{formatCurrency(totals.totalAutorizadosValor)}</p>
        </div>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Buscar</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg w-full text-sm"
                placeholder="Tomador, discriminação..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="w-48">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Status</label>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <TableColGroup widths={widths} />
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/60">
              <ResizableSortableTh columnId="status" label="Status" sort={sort} onSort={(c) => setSort(toggleSort(sort, c))} onStartResize={startResize} />
              <ResizableSortableTh columnId="numero" label="Número" sort={sort} onSort={(c) => setSort(toggleSort(sort, c))} onStartResize={startResize} />
              <ResizableSortableTh columnId="tomador" label="Tomador" sort={sort} onSort={(c) => setSort(toggleSort(sort, c))} onStartResize={startResize} />
              <ResizableSortableTh columnId="valor" label="Valor" sort={sort} onSort={(c) => setSort(toggleSort(sort, c))} onStartResize={startResize} />
              <ResizableSortableTh columnId="ambiente" label="Ambiente" sort={sort} onSort={(c) => setSort(toggleSort(sort, c))} onStartResize={startResize} />
              <ResizableSortableTh columnId="atualizado" label="Atualizado" sort={sort} onSort={(c) => setSort(toggleSort(sort, c))} onStartResize={startResize} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400"><Loader2 size={24} className="inline animate-spin" /> Carregando...</td></tr>
            ) : sortedRows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Nenhuma NFS-e encontrada.</td></tr>
            ) : sortedRows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/40">
                <td className="px-4 py-3">
                  {statusBadge(row.status)}
                  {row.status === 'rejeitada' && row.last_error && (
                    <div className="text-xs text-red-600 mt-1 max-w-[240px] truncate" title={row.last_error}>
                      {row.last_error}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{row.numero ?? '—'}</td>
                <td className="px-4 py-3 truncate max-w-[240px]">{row.tomador_nome ?? '—'}</td>
                <td className="px-4 py-3 font-mono">{formatCurrency(row.valor_servicos)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${row.ambiente === 'producao' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                    {row.ambiente === 'producao' ? 'Produção' : 'Homologação'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{formatDate(row.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {row.status === 'rascunho' && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(row)} title="Editar rascunho">
                          <FileText size={14} />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSubmit(row.id)}
                          disabled={!!submitting}
                          title="Enviar para autorização"
                        >
                          {submitting === row.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          <span className="ml-1">Enviar</span>
                        </Button>
                      </>
                    )}
                    {row.status === 'autorizada' && row.codigo_verificacao && (
                      <Button size="sm" variant="secondary" onClick={() => handleCopy(row.codigo_verificacao!, 'Código de verificação')} title="Copiar código de verificação">
                        <Copy size={14} />
                      </Button>
                    )}
                    {row.status === 'autorizada' && row.pdf_url && (
                      <a href={row.pdf_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="secondary" title="Baixar PDF">
                          <Download size={14} className="text-blue-600" />
                          <span className="ml-1 text-xs">PDF</span>
                        </Button>
                      </a>
                    )}
                    {row.status === 'autorizada' && row.xml_url && (
                      <a href={row.xml_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="secondary" title="Baixar XML">
                          <Download size={14} className="text-gray-500" />
                          <span className="ml-1 text-xs">XML</span>
                        </Button>
                      </a>
                    )}
                    {['processando', 'enfileirada'].includes(row.status) && (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" /> Processando...
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      {/* Modal — Novo/Editar Rascunho */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Editar rascunho NFS-e' : 'Novo rascunho NFS-e'} size="lg">
        <div className="p-6 space-y-5">
          {draftErrors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-sm font-semibold text-red-800">Revise o rascunho</div>
              <ul className="mt-2 list-disc list-inside text-sm text-red-700 space-y-1">
                {draftErrors.map((err, idx) => <li key={idx}>{err}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Ambiente</label>
              <Select value={formAmbiente} onChange={(e) => setFormAmbiente(e.target.value as AmbienteNfse)}>
                <option value="homologacao">Homologação (teste)</option>
                <option value="producao">Produção</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Natureza da operação</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={formNaturezaOperacao}
                onChange={(e) => setFormNaturezaOperacao(e.target.value)}
                placeholder="Ex.: Prestação de serviços"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Tomador (cliente)</label>
            <ClientAutocomplete
              value={formTomadorId}
              initialLabel={formTomadorName}
              onChange={(id, name) => { setFormTomadorId(id); setFormTomadorName(name); }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Discriminação do serviço</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[80px]"
              value={formDiscriminacao}
              onChange={(e) => setFormDiscriminacao(e.target.value)}
              placeholder="Descreva o serviço prestado..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Valor dos serviços (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={formValorServicos}
                onChange={(e) => setFormValorServicos(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Alíquota ISS (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={formAliquotaIss}
                onChange={(e) => setFormAliquotaIss(e.target.value)}
                placeholder="Ex.: 5.00"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIssRetido}
                  onChange={(e) => setFormIssRetido(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">ISS retido</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Item lista de serviço (LC 116)</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={formItemListaServico}
                onChange={(e) => setFormItemListaServico(e.target.value)}
                placeholder="Ex.: 14.01"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Código município IBGE</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={formCodigoMunicipio}
                onChange={(e) => setFormCodigoMunicipio(e.target.value)}
                placeholder="Ex.: 3550308"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveDraft} disabled={saving}>
              {saving ? <><Loader2 size={16} className="animate-spin mr-1" /> Salvando...</> : 'Salvar rascunho'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
