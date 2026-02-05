import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, PlusCircle, ScanLine, Search, Truck } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import Input from '@/components/ui/forms/Input';
import { listVendas, type VendaPedido } from '@/services/vendas';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import {
  getExpedicaoSlaStats,
  listExpedicaoEventos,
  listExpedicoesSla,
  upsertExpedicao,
  type ExpedicaoEvento,
  type ExpedicaoSlaRow,
  type ExpedicaoStatus,
} from '@/services/vendasMvp';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import QuickScanModal from '@/components/ui/QuickScanModal';
import { useAuth } from '@/contexts/AuthProvider';

type FormState = {
  pedido_id: string;
  status: ExpedicaoStatus;
  tracking_code: string;
  data_envio: string;
  data_entrega: string;
  observacoes: string;
};

const emptyForm: FormState = {
  pedido_id: '',
  status: 'separando',
  tracking_code: '',
  data_envio: '',
  data_entrega: '',
  observacoes: '',
};

export default function ExpedicaoPage() {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ExpedicaoSlaRow[]>([]);
  const [orders, setOrders] = useState<VendaPedido[]>([]); // usado no modal (seleção de pedido)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpedicaoStatus | 'all'>('all');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [slaHours, setSlaHours] = useState(48);
  const [stats, setStats] = useState<{ abertas: number; overdue: number; enviado: number; entregue: number; cancelado: number } | null>(null);
  const [selectedExpedicaoId, setSelectedExpedicaoId] = useState<string | null>(null);
  const [eventos, setEventos] = useState<ExpedicaoEvento[]>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'search' | 'tracking'>('search');
  const [sort, setSort] = useState<SortState<string>>({ column: 'pedido', direction: 'desc' });

  const columns: TableColumnWidthDef[] = [
    { id: 'pedido', defaultWidth: 360, minWidth: 240 },
    { id: 'status', defaultWidth: 160, minWidth: 140 },
    { id: 'rastreio', defaultWidth: 200, minWidth: 160 },
    { id: 'envio', defaultWidth: 150, minWidth: 140 },
    { id: 'entrega', defaultWidth: 150, minWidth: 140 },
    { id: 'acoes', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'vendas:expedicao', columns });

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;

  useEffect(() => {
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  const effectiveRows = empresaChanged ? [] : rows;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return effectiveRows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (onlyOverdue && !r.overdue) return false;
      if (!q) return true;
      const hay = `${r.pedido_numero ?? ''} ${r.cliente_nome ?? ''} ${r.tracking_code ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [effectiveRows, search, statusFilter, onlyOverdue]);

  const sortedRows = useMemo(() => {
    return sortRows(
      filteredRows,
      sort as any,
      [
        { id: 'pedido', type: 'number', getValue: (r) => r.pedido_numero ?? 0 },
        { id: 'status', type: 'string', getValue: (r) => statusLabel[r.status] ?? String(r.status ?? '') },
        { id: 'rastreio', type: 'string', getValue: (r) => r.tracking_code ?? '' },
        { id: 'envio', type: 'date', getValue: (r) => r.data_envio ?? null },
        { id: 'entrega', type: 'date', getValue: (r) => r.data_entrega ?? null },
      ] as const
    );
  }, [filteredRows, sort]);

  async function load() {
    if (!activeEmpresaId) {
      setRows([]);
      setOrders([]);
      setStats(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [exp, ord, st] = await Promise.all([
        listExpedicoesSla({ slaHours, onlyOverdue: false, status: statusFilter === 'all' ? null : [statusFilter], limit: 500, offset: 0 }),
        listVendas({ search: '', status: undefined, limit: 500, offset: 0 }),
        getExpedicaoSlaStats({ slaHours }),
      ]);
      setRows(exp);
      setOrders(ord);
      setStats(st);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar expedições.', 'error');
      setRows([]);
      setOrders([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setRows([]);
    setOrders([]);
    setStats(null);
    setSelectedExpedicaoId(null);
    setEventos([]);
    setIsOpen(false);
    setForm(emptyForm);
    setSaving(false);
    setIsScanOpen(false);

    if (!activeEmpresaId) {
      setLoading(false);
      return;
    }
    setLoading(true);
  }, [activeEmpresaId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresaId]);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresaId, slaHours]);

  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);

  if (authLoading) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  if (!activeEmpresaId) {
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver expedições.</div>;
  }

  const openNew = () => {
    setForm(emptyForm);
    setSelectedExpedicaoId(null);
    setEventos([]);
    setIsOpen(true);
  };

  const openEdit = (row: ExpedicaoSlaRow) => {
    setForm({
      pedido_id: row.pedido_id,
      status: row.status,
      tracking_code: row.tracking_code || '',
      data_envio: row.data_envio || '',
      data_entrega: row.data_entrega || '',
      observacoes: (row as any).observacoes || '',
    });
    setSelectedExpedicaoId(row.expedicao_id);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
    setSelectedExpedicaoId(null);
    setEventos([]);
  };

  const handleOpenScan = (mode: 'search' | 'tracking') => {
    setScanMode(mode);
    setIsScanOpen(true);
  };

  const handleScanResult = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setIsScanOpen(false);

    if (scanMode === 'tracking') {
      setForm((s) => ({ ...s, tracking_code: value }));
      addToast('Tracking preenchido a partir do scan.', 'success');
      return;
    }

    setSearch(value);
    const onlyDigits = value.replace(/\D/g, '');
    const pedidoNumero = onlyDigits ? Number(onlyDigits) : NaN;
    const found =
      Number.isFinite(pedidoNumero) && pedidoNumero > 0
        ? rows.find((r) => Number(r.pedido_numero) === pedidoNumero)
        : rows.find((r) => (r.tracking_code || '').toLowerCase().includes(value.toLowerCase()));

    if (found) {
      openEdit(found);
      addToast(`Expedição encontrada para o pedido #${found.pedido_numero}.`, 'success');
    } else {
      addToast('Código escaneado aplicado na busca. Nenhuma expedição encontrada.', 'info');
    }
  };

  useEffect(() => {
    if (!isOpen || !selectedExpedicaoId) return;
    (async () => {
      try {
        const ev = await listExpedicaoEventos(selectedExpedicaoId);
        setEventos(ev);
      } catch {
        setEventos([]);
      }
    })();
  }, [isOpen, selectedExpedicaoId]);

  const save = async () => {
    if (!form.pedido_id) {
      addToast('Selecione um pedido.', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertExpedicao({
        pedido_id: form.pedido_id,
        status: form.status,
        tracking_code: form.tracking_code.trim() || null,
        data_envio: form.data_envio || null,
        data_entrega: form.data_entrega || null,
        observacoes: form.observacoes.trim() || null,
      } as any);
      addToast('Expedição salva.', 'success');
      try {
        const ev = await listExpedicaoEventos(saved.id);
        setSelectedExpedicaoId(saved.id);
        setEventos(ev);
      } catch {
        // ignore
      }
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar expedição.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const statusLabel: Record<ExpedicaoStatus, string> = {
    separando: 'Separação',
    embalado: 'Embalagem',
    enviado: 'Envio',
    entregue: 'Entrega',
    cancelado: 'Cancelado',
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Truck className="text-blue-600" /> Expedição
          </h1>
          <p className="text-gray-600 text-sm mt-1">Acompanhe status e rastreio por pedido.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Nova Expedição
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4 flex-shrink-0">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Abertas</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock3 className="text-blue-600" size={18} />
            {stats?.abertas ?? '—'}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Atrasadas (SLA)</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="text-orange-600" size={18} />
            {stats?.overdue ?? '—'}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Enviadas</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{stats?.enviado ?? '—'}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Entregues</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" size={18} />
            {stats?.entregue ?? '—'}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">SLA (horas)</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={slaHours}
              onChange={(e) => setSlaHours(Math.max(1, Number(e.target.value || 48)))}
              className="w-full p-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="mt-1 text-[11px] text-gray-500">Calculado a partir de `created_at`.</div>
        </div>
      </div>

      <div className="mb-4 flex gap-4 flex-shrink-0">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por pedido, cliente ou tracking…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-2.5 pl-9 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => handleOpenScan('search')}
          className="p-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 flex items-center gap-2"
          title="Escanear pedido/tracking para filtrar (WMS light)"
        >
          <ScanLine size={18} className="text-blue-700" />
          <span className="text-sm font-semibold text-gray-800 hidden md:inline">Escanear</span>
        </button>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="p-2.5 border border-gray-300 rounded-xl min-w-[180px]"
        >
          <option value="all">Todos</option>
          <option value="separando">Separando</option>
          <option value="embalado">Embalado</option>
          <option value="enviado">Enviado</option>
          <option value="entregue">Entregue</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(e) => setOnlyOverdue(e.target.checked)}
            className="h-4 w-4"
          />
          Só atrasadas (SLA)
        </label>
        <CsvExportDialog
          filename="expedicoes.csv"
          rows={filteredRows}
          disabled={effectiveLoading}
          columns={[
            { key: 'pedido', label: 'Pedido', getValue: (r) => r.pedido_numero ?? '' },
            { key: 'cliente', label: 'Cliente', getValue: (r) => r.cliente_nome ?? '' },
            { key: 'status', label: 'Status', getValue: (r) => statusLabel[r.status] ?? r.status },
            { key: 'tracking', label: 'Tracking', getValue: (r) => r.tracking_code ?? '' },
            { key: 'envio', label: 'Data envio', getValue: (r) => r.data_envio ?? '' },
            { key: 'entrega', label: 'Data entrega', getValue: (r) => r.data_entrega ?? '' },
            { key: 'overdue', label: 'Atrasada', getValue: (r) => (r.overdue ? 'sim' : 'não') },
            { key: 'age_hours', label: 'Horas em aberto', getValue: (r) => r.age_hours },
          ]}
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {effectiveLoading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">
            {effectiveRows.length === 0 ? (
              <div className="text-center space-y-2">
                <div>Nenhuma expedição cadastrada.</div>
                <button onClick={openNew} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700">
                  Nova Expedição
                </button>
              </div>
            ) : (
              <div>Nenhum resultado para os filtros.</div>
            )}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <TableColGroup columns={columns} widths={widths} />
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <ResizableSortableTh columnId="pedido" label="Pedido" className="px-4 py-3 normal-case tracking-normal" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="status" label="Status" className="px-4 py-3 normal-case tracking-normal" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="rastreio" label="Rastreio" className="px-4 py-3 normal-case tracking-normal" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="envio" label="Envio" className="px-4 py-3 normal-case tracking-normal" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="entrega" label="Entrega" className="px-4 py-3 normal-case tracking-normal" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResize as any} />
                  <ResizableSortableTh columnId="acoes" label="Ações" align="right" className="px-4 py-3 normal-case tracking-normal" sortable={false} resizable onResizeStart={startResize as any} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedRows.map((r) => {
                  return (
                    <tr key={r.expedicao_id} className={`hover:bg-gray-50 ${r.overdue ? 'bg-orange-50/40' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        #{r.pedido_numero} — {r.cliente_nome || ''}
                        {r.overdue ? <span className="ml-2 text-xs font-semibold text-orange-700">Atrasada</span> : null}
                      </td>
                      <td className="px-4 py-3">{statusLabel[r.status] ?? r.status}</td>
                      <td className="px-4 py-3">{r.tracking_code || '-'}</td>
                      <td className="px-4 py-3">{r.data_envio || '-'}</td>
                      <td className="px-4 py-3">{r.data_entrega || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button onClick={() => openEdit(r)} className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
                            Editar
                          </button>
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

      <Modal isOpen={isOpen} onClose={close} title="Expedição (MVP)">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <div>
              <label className="text-sm text-gray-700">Pedido</label>
              <select
                value={form.pedido_id}
                onChange={(e) => setForm((s) => ({ ...s, pedido_id: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                disabled={selectedExpedicaoId !== null}
              >
                <option value="">Selecione…</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.numero} — {o.cliente_nome}
                  </option>
                ))}
              </select>
              {selectedExpedicaoId ? (
                <div className="mt-1 text-xs text-gray-500">Pedido já vinculado (EXP-02): para trocar, crie outra expedição.</div>
              ) : null}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-sm font-semibold text-gray-800 mb-2">Etapas</div>
              <div className="flex flex-wrap gap-2">
                {(['separando', 'embalado', 'enviado', 'entregue', 'cancelado'] as ExpedicaoStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setForm((s) => ({ ...s, status: st }))}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                      form.status === st ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {statusLabel[st]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-700">Tracking</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={form.tracking_code}
                    onChange={(e) => setForm((s) => ({ ...s, tracking_code: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                    placeholder="Código de rastreio"
                  />
                  <button
                    type="button"
                    onClick={() => handleOpenScan('tracking')}
                    className="shrink-0 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                    title="Escanear tracking"
                  >
                    <ScanLine size={18} className="text-blue-700" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-700">Status atual</label>
                <div className="mt-1 w-full p-3 border border-gray-200 rounded-lg bg-gray-50 font-semibold text-gray-800">
                  {statusLabel[form.status]}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Data de envio"
                  name="data_envio"
                  type="date"
                  value={form.data_envio}
                  onChange={(e) => setForm((s) => ({ ...s, data_envio: e.target.value }))}
                />
                <div className="mt-1 text-xs text-gray-500">Se marcar “Enviado/Entregue”, preenchimento automático se vazio.</div>
              </div>
              <Input
                label="Data de entrega"
                name="data_entrega"
                type="date"
                value={form.data_entrega}
                onChange={(e) => setForm((s) => ({ ...s, data_entrega: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Observações</label>
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm((s) => ({ ...s, observacoes: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                rows={3}
                placeholder="Ex.: Embalagem frágil, deixar com porteiro..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={close} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">
                Fechar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-lg border border-gray-200 bg-white p-3 h-full">
              <div className="text-sm font-semibold text-gray-800 mb-3">Histórico</div>
              {!selectedExpedicaoId ? (
                <div className="text-sm text-gray-500">Salve a expedição para ver o histórico (EXP-02).</div>
              ) : eventos.length === 0 ? (
                <div className="text-sm text-gray-500">Nenhum evento ainda.</div>
              ) : (
                <div className="space-y-2 max-h-[55vh] overflow-auto">
                  {eventos.map((ev) => (
                    <div key={ev.id} className="p-2 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="text-xs text-gray-500">{new Date(ev.created_at).toLocaleString('pt-BR')}</div>
                      <div className="text-sm font-semibold text-gray-800">{ev.mensagem || ev.tipo}</div>
                      {ev.tipo === 'status' ? (
                        <div className="text-xs text-gray-600">
                          {ev.de_status ? `${statusLabel[ev.de_status as ExpedicaoStatus] ?? ev.de_status} → ` : ''}
                          {statusLabel[ev.para_status as ExpedicaoStatus] ?? ev.para_status}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <QuickScanModal
        isOpen={isScanOpen}
        onClose={() => setIsScanOpen(false)}
        title={scanMode === 'tracking' ? 'Escanear tracking' : 'Escanear pedido/tracking'}
        helper={
          scanMode === 'tracking'
            ? 'Escaneie o código de rastreio. Ele será preenchido no campo Tracking.'
            : 'Escaneie o número do pedido ou o tracking para filtrar/abrir a expedição.'
        }
        confirmLabel="Usar"
        onResult={handleScanResult}
      />
    </div>
  );
}
