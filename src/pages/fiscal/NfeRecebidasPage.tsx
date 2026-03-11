import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileDown,
  Loader2,
  RefreshCw,
  Search,
  ChevronDown,
  Eye,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Ban,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';
import SideSheet from '@/components/ui/SideSheet';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { formatCurrency } from '@/lib/utils';
import RoadmapButton from '@/components/roadmap/RoadmapButton';
import {
  listNfeDestinadasRpc,
  getNfeDestinadasSummary,
  getNfeDestinadasSyncStatus,
  manifestarNfeDestinadasRpc,
  syncNfeDestinadasManual,
  type NfeDestinadaRow,
  type NfeDestinadaSummary,
  type NfeDestinadaSyncStatus,
  type NfeDestinadaStatus,
} from '@/services/nfeDestinadasService';

// ============================================================
// Status helpers
// ============================================================

const STATUS_CONFIG: Record<NfeDestinadaStatus, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  pendente:       { label: 'Pendente',         bg: 'bg-amber-100',   text: 'text-amber-800',  icon: Clock },
  ciencia:        { label: 'Ciência',          bg: 'bg-blue-100',    text: 'text-blue-800',   icon: Eye },
  confirmada:     { label: 'Confirmada',       bg: 'bg-emerald-100', text: 'text-emerald-800',icon: CheckCircle2 },
  desconhecida:   { label: 'Desconhecida',     bg: 'bg-red-100',     text: 'text-red-800',    icon: XCircle },
  nao_realizada:  { label: 'Não Realizada',    bg: 'bg-gray-100',    text: 'text-gray-700',   icon: Ban },
  ignorada:       { label: 'Ignorada',         bg: 'bg-gray-50',     text: 'text-gray-500',   icon: HelpCircle },
};

function StatusBadge({ status }: { status: NfeDestinadaStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendente;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

function formatCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function timeAgo(iso: string | null) {
  if (!iso) return 'nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

// ============================================================
// Component
// ============================================================

export default function NfeRecebidasPage() {
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const empresaId = activeEmpresa?.id;

  // Data
  const [rows, setRows] = useState<NfeDestinadaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<NfeDestinadaSummary | null>(null);
  const [syncStatus, setSyncStatus] = useState<NfeDestinadaSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Detail sheet
  const [detailRow, setDetailRow] = useState<NfeDestinadaRow | null>(null);

  // Manifestation
  const [manifestando, setManifestando] = useState(false);
  const [justificativaText, setJustificativaText] = useState('');
  const [showJustificativa, setShowJustificativa] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [listResult, summaryResult, syncResult] = await Promise.all([
        listNfeDestinadasRpc({
          status: statusFilter || undefined,
          startDate: dataInicio || undefined,
          endDate: dataFim || undefined,
          search: search || undefined,
          page,
          pageSize,
        }),
        getNfeDestinadasSummary(),
        getNfeDestinadasSyncStatus(),
      ]);
      setRows(listResult.rows || []);
      setTotal(listResult.total || 0);
      setSummary(summaryResult);
      setSyncStatus(syncResult);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar NF-e recebidas.', 'error');
    } finally {
      setLoading(false);
    }
  }, [empresaId, statusFilter, dataInicio, dataFim, search, page, addToast]);

  useEffect(() => {
    if (empresaId) void fetchData();
  }, [empresaId, fetchData]);

  // Sync
  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncNfeDestinadasManual();
      addToast('Sincronização iniciada. Os dados serão atualizados em instantes.', 'info');
      // Refresh after a short delay to allow edge function to process
      setTimeout(() => void fetchData(), 3000);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao iniciar sincronização.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  // Manifestation
  const handleManifestar = async (status: NfeDestinadaStatus) => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      addToast('Selecione pelo menos uma NF-e.', 'warning');
      return;
    }

    if (status === 'nao_realizada') {
      setShowJustificativa(true);
      return;
    }

    setManifestando(true);
    try {
      const result = await manifestarNfeDestinadasRpc(ids, status);
      addToast(`${result.updated} NF-e(s) atualizadas para "${STATUS_CONFIG[status].label}".`, 'success');
      setSelected(new Set());
      await fetchData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao manifestar.', 'error');
    } finally {
      setManifestando(false);
    }
  };

  const handleNaoRealizada = async () => {
    const ids = Array.from(selected);
    if (justificativaText.trim().length < 15) {
      addToast('Justificativa deve ter no mínimo 15 caracteres.', 'error');
      return;
    }
    setManifestando(true);
    try {
      const result = await manifestarNfeDestinadasRpc(ids, 'nao_realizada', justificativaText.trim());
      addToast(`${result.updated} NF-e(s) marcadas como "Não Realizada".`, 'success');
      setSelected(new Set());
      setShowJustificativa(false);
      setJustificativaText('');
      await fetchData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao manifestar.', 'error');
    } finally {
      setManifestando(false);
    }
  };

  // Summary cards
  const summaryCards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: 'Pendentes', value: summary.pendentes, color: 'bg-amber-50 border-amber-200 text-amber-800' },
      { label: 'Ciência', value: summary.ciencia, color: 'bg-blue-50 border-blue-200 text-blue-800' },
      { label: 'Confirmadas', value: summary.confirmadas, color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
      { label: 'Valor Total', value: formatCurrency(summary.valor_total), color: 'bg-indigo-50 border-indigo-200 text-indigo-800', isText: true },
    ];
  }, [summary]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-1">
      <div className="mb-6">
        <PageHeader
          title="NF-e Recebidas"
          description="Notas fiscais emitidas por fornecedores contra o CNPJ da sua empresa. Gerencie a manifestação do destinatário."
          icon={<FileDown size={20} />}
          actions={
            <div className="flex items-center gap-3">
              {syncStatus && (
                <span className="text-xs text-slate-500">
                  Última sync: {timeAgo(syncStatus.last_sync_at)}
                </span>
              )}
              <Button onClick={handleSync} disabled={syncing} variant="secondary">
                {syncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                <span className="ml-2">Sincronizar</span>
              </Button>
              <RoadmapButton contextKey="fiscal" label="Assistente" title="Abrir assistente" />
            </div>
          }
        />
      </div>

      {loading && rows.length === 0 ? (
        <div className="h-56 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {summaryCards.map((c) => (
                <div key={c.label} className={`rounded-xl border p-4 ${c.color}`}>
                  <div className="text-xs font-semibold opacity-70">{c.label}</div>
                  <div className="text-xl font-bold mt-1">
                    {c.isText ? c.value : Number(c.value).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sync status alert */}
          {syncStatus && syncStatus.last_sync_status === 'error' && (
            <GlassCard className="p-4 border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <AlertTriangle size={16} />
                <span>Última sincronização falhou: {syncStatus.last_sync_error || 'erro desconhecido'}</span>
              </div>
            </GlassCard>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por emitente, CNPJ ou chave..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="w-40">
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="">Todos os status</option>
                <option value="pendente">Pendente</option>
                <option value="ciencia">Ciência</option>
                <option value="confirmada">Confirmada</option>
                <option value="desconhecida">Desconhecida</option>
                <option value="nao_realizada">Não Realizada</option>
                <option value="ignorada">Ignorada</option>
              </Select>
            </div>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => { setDataInicio(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={dataFim}
              onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <span className="text-sm font-semibold text-blue-800">
                {selected.size} selecionada(s)
              </span>
              <div className="relative group">
                <Button disabled={manifestando} variant="secondary" className="gap-1">
                  {manifestando ? <Loader2 className="animate-spin" size={14} /> : null}
                  Manifestar
                  <ChevronDown size={14} />
                </Button>
                <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 hidden group-hover:block min-w-[220px]">
                  <button onClick={() => void handleManifestar('ciencia')} className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center gap-2">
                    <Eye size={14} className="text-blue-600" /> Ciência da Operação
                  </button>
                  <button onClick={() => void handleManifestar('confirmada')} className="w-full text-left px-4 py-2 text-sm hover:bg-emerald-50 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-600" /> Confirmar Operação
                  </button>
                  <button onClick={() => void handleManifestar('desconhecida')} className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 flex items-center gap-2">
                    <XCircle size={14} className="text-red-600" /> Desconhecer Operação
                  </button>
                  <button onClick={() => void handleManifestar('nao_realizada')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                    <Ban size={14} className="text-gray-600" /> Operação não Realizada
                  </button>
                  <hr className="my-1" />
                  <button onClick={() => void handleManifestar('ignorada')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-500">
                    <HelpCircle size={14} /> Ignorar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-blue-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Emitente</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">CNPJ</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Valor</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Emissão</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Prazo</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500">
                      {loading ? (
                        <Loader2 className="animate-spin mx-auto" size={24} />
                      ) : (
                        <div>
                          <FileDown size={32} className="mx-auto mb-2 text-gray-300" />
                          <p>Nenhuma NF-e recebida encontrada.</p>
                          <p className="text-xs mt-1">Clique em "Sincronizar" para consultar a SEFAZ.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isSelected = selected.has(row.id);
                    const prazoDate = row.status === 'pendente' ? row.prazo_ciencia : row.prazo_manifestacao;
                    const isPrazoUrgente = prazoDate && new Date(prazoDate) < new Date(Date.now() + 3 * 86_400_000);

                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                        onClick={() => setDetailRow(row)}
                      >
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(row.id)}
                            className="h-4 w-4 accent-blue-600"
                          />
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-800 truncate max-w-[200px]">
                          {row.nome_emitente || '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-600 font-mono text-xs">
                          {formatCnpj(row.cnpj_emitente)}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-800">
                          {formatCurrency(row.valor_nf)}
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {formatDate(row.data_emissao)}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {prazoDate ? (
                            <span className={isPrazoUrgente ? 'text-red-600 font-semibold' : ''}>
                              {formatDate(prazoDate)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailRow(row); }}
                            className="p-1 rounded hover:bg-gray-100"
                            title="Ver detalhes"
                          >
                            <Eye size={16} className="text-gray-400" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                {total} registro(s) — página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail SideSheet */}
      <SideSheet
        isOpen={!!detailRow}
        onClose={() => setDetailRow(null)}
        title={detailRow?.nome_emitente || 'Detalhes da NF-e'}
        description={detailRow ? `Chave: ${detailRow.chave_acesso}` : undefined}
        widthClassName="w-[min(640px,92vw)]"
      >
        {detailRow && <NfeDetalhe row={detailRow} onAction={async (status, justificativa) => {
          setManifestando(true);
          try {
            await manifestarNfeDestinadasRpc([detailRow.id], status, justificativa);
            addToast(`NF-e atualizada para "${STATUS_CONFIG[status as NfeDestinadaStatus]?.label || status}".`, 'success');
            setDetailRow(null);
            await fetchData();
          } catch (e: any) {
            addToast(e?.message || 'Erro ao manifestar.', 'error');
          } finally {
            setManifestando(false);
          }
        }} disabled={manifestando} />}
      </SideSheet>

      {/* Justificativa modal (for "Não Realizada") */}
      {showJustificativa && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Justificativa obrigatória</h3>
            <p className="text-sm text-gray-600 mb-4">
              Para marcar como "Operação não Realizada", informe o motivo (mínimo 15 caracteres).
            </p>
            <textarea
              value={justificativaText}
              onChange={(e) => setJustificativaText(e.target.value)}
              rows={4}
              className="w-full p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Descreva o motivo..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="secondary" onClick={() => { setShowJustificativa(false); setJustificativaText(''); }}>
                Cancelar
              </Button>
              <Button
                onClick={() => void handleNaoRealizada()}
                disabled={manifestando || justificativaText.trim().length < 15}
              >
                {manifestando ? <Loader2 className="animate-spin" size={16} /> : null}
                <span className="ml-1">Confirmar</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Detail component
// ============================================================

function NfeDetalhe({
  row,
  onAction,
  disabled,
}: {
  row: NfeDestinadaRow;
  onAction: (status: string, justificativa?: string) => Promise<void>;
  disabled: boolean;
}) {
  const [justText, setJustText] = useState('');
  const [showJust, setShowJust] = useState(false);

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center justify-between">
        <StatusBadge status={row.status} />
        {row.manifestado_em && (
          <span className="text-xs text-gray-500">
            Manifestado em: {formatDate(row.manifestado_em)}
          </span>
        )}
      </div>

      {/* Emitente */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Emitente" value={row.nome_emitente} />
        <Field label="CNPJ Emitente" value={formatCnpj(row.cnpj_emitente)} />
        <Field label="IE Emitente" value={row.ie_emitente} />
        <Field label="Valor" value={formatCurrency(row.valor_nf)} />
        <Field label="Data Emissão" value={formatDate(row.data_emissao)} />
        <Field label="Protocolo" value={row.protocolo} />
      </div>

      {/* Chave de acesso */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Chave de Acesso</label>
        <div className="font-mono text-xs bg-gray-50 p-2 rounded border border-gray-200 break-all select-all">
          {row.chave_acesso}
        </div>
      </div>

      {/* Prazos */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Prazo Ciência" value={formatDate(row.prazo_ciencia)} warn={row.prazo_ciencia ? new Date(row.prazo_ciencia) < new Date() : false} />
        <Field label="Prazo Manifestação" value={formatDate(row.prazo_manifestacao)} warn={row.prazo_manifestacao ? new Date(row.prazo_manifestacao) < new Date() : false} />
      </div>

      {/* Justificativa (if nao_realizada) */}
      {row.justificativa && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Justificativa</label>
          <div className="text-sm bg-gray-50 p-2 rounded border border-gray-200">{row.justificativa}</div>
        </div>
      )}

      {/* Integrations */}
      {(row.fornecedor_nome || row.conta_pagar_id) && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fornecedor vinculado" value={row.fornecedor_nome} />
          <Field label="Conta a pagar" value={row.conta_pagar_id ? 'Vinculada' : 'Não vinculada'} />
        </div>
      )}

      {/* Actions */}
      {(row.status === 'pendente' || row.status === 'ciencia') && (
        <div className="border-t border-gray-200 pt-4 space-y-2">
          <div className="text-xs font-semibold text-gray-500 mb-2">Ações de Manifestação</div>
          <div className="flex flex-wrap gap-2">
            {row.status === 'pendente' && (
              <Button variant="secondary" disabled={disabled} onClick={() => void onAction('ciencia')} className="gap-1">
                <Eye size={14} /> Ciência
              </Button>
            )}
            <Button disabled={disabled} onClick={() => void onAction('confirmada')} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 size={14} /> Confirmar
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => void onAction('desconhecida')} className="gap-1 text-red-600 border-red-200 hover:bg-red-50">
              <XCircle size={14} /> Desconhecer
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => setShowJust(true)} className="gap-1">
              <Ban size={14} /> Não Realizada
            </Button>
          </div>
          {showJust && (
            <div className="mt-3 space-y-2">
              <textarea
                value={justText}
                onChange={(e) => setJustText(e.target.value)}
                rows={3}
                className="w-full p-2 text-sm border border-gray-300 rounded-lg"
                placeholder="Justificativa (min 15 caracteres)..."
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setShowJust(false); setJustText(''); }}>Cancelar</Button>
                <Button disabled={disabled || justText.trim().length < 15} onClick={() => void onAction('nao_realizada', justText.trim())}>
                  Enviar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, warn }: { label: string; value: string | null | undefined; warn?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-0.5">{label}</label>
      <div className={`text-sm ${warn ? 'text-red-600 font-semibold' : 'text-gray-800'}`}>
        {value || '—'}
      </div>
    </div>
  );
}
