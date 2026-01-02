import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PlusCircle, Search, Truck } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import { listVendas, type VendaPedido } from '@/services/vendas';
import { listExpedicaoEventos, listExpedicoes, upsertExpedicao, type Expedicao, type ExpedicaoEvento, type ExpedicaoStatus } from '@/services/vendasMvp';
import CsvExportDialog from '@/components/ui/CsvExportDialog';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Expedicao[]>([]);
  const [orders, setOrders] = useState<VendaPedido[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpedicaoStatus | 'all'>('all');
  const [selectedExpedicaoId, setSelectedExpedicaoId] = useState<string | null>(null);
  const [eventos, setEventos] = useState<ExpedicaoEvento[]>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const orderById = useMemo(() => {
    const map = new Map<string, VendaPedido>();
    for (const o of orders) map.set(o.id, o);
    return map;
  }, [orders]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      const order = orderById.get(r.pedido_id);
      const hay = `${order?.numero ?? ''} ${order?.cliente_nome ?? ''} ${r.tracking_code ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter, orderById]);

  async function load() {
    setLoading(true);
    try {
      const [exp, ord] = await Promise.all([listExpedicoes(), listVendas('', undefined)]);
      setRows(exp);
      setOrders(ord);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar expedições.', 'error');
      setRows([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setForm(emptyForm);
    setSelectedExpedicaoId(null);
    setEventos([]);
    setIsOpen(true);
  };

  const openEdit = (row: Expedicao) => {
    setForm({
      pedido_id: row.pedido_id,
      status: row.status,
      tracking_code: row.tracking_code || '',
      data_envio: row.data_envio || '',
      data_entrega: row.data_entrega || '',
      observacoes: row.observacoes || '',
    });
    setSelectedExpedicaoId(row.id);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
    setSelectedExpedicaoId(null);
    setEventos([]);
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
        <CsvExportDialog
          filename="expedicoes.csv"
          rows={filteredRows}
          disabled={loading}
          columns={[
            { key: 'pedido', label: 'Pedido', getValue: (r) => orderById.get(r.pedido_id)?.numero ?? '' },
            { key: 'cliente', label: 'Cliente', getValue: (r) => orderById.get(r.pedido_id)?.cliente_nome ?? '' },
            { key: 'status', label: 'Status', getValue: (r) => statusLabels[r.status] ?? r.status },
            { key: 'tracking', label: 'Tracking', getValue: (r) => r.tracking_code ?? '' },
            { key: 'envio', label: 'Data envio', getValue: (r) => r.data_envio ?? '' },
            { key: 'entrega', label: 'Data entrega', getValue: (r) => r.data_entrega ?? '' },
          ]}
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">
            {rows.length === 0 ? (
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
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Rastreio</th>
                  <th className="px-4 py-3">Envio</th>
                  <th className="px-4 py-3">Entrega</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRows.map((r) => {
                  const o = orderById.get(r.pedido_id);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {o ? `#${o.numero} — ${o.cliente_nome || ''}` : r.pedido_id}
                      </td>
                      <td className="px-4 py-3">{r.status}</td>
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
                <input
                  value={form.tracking_code}
                  onChange={(e) => setForm((s) => ({ ...s, tracking_code: e.target.value }))}
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                  placeholder="Código de rastreio"
                />
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
                <label className="text-sm text-gray-700">Data de envio</label>
                <input
                  type="date"
                  value={form.data_envio}
                  onChange={(e) => setForm((s) => ({ ...s, data_envio: e.target.value }))}
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                />
                <div className="mt-1 text-xs text-gray-500">Se marcar “Enviado/Entregue”, preenchimento automático se vazio.</div>
              </div>
              <div>
                <label className="text-sm text-gray-700">Data de entrega</label>
                <input
                  type="date"
                  value={form.data_entrega}
                  onChange={(e) => setForm((s) => ({ ...s, data_entrega: e.target.value }))}
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                />
              </div>
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
    </div>
  );
}
