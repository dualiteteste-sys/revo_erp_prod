import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PlusCircle, Truck } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import { listVendas, type VendaPedido } from '@/services/vendas';
import { listExpedicoes, upsertExpedicao, type Expedicao, type ExpedicaoStatus } from '@/services/vendasMvp';

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

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const orderById = useMemo(() => {
    const map = new Map<string, VendaPedido>();
    for (const o of orders) map.set(o.id, o);
    return map;
  }, [orders]);

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
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.pedido_id) {
      addToast('Selecione um pedido.', 'error');
      return;
    }
    setSaving(true);
    try {
      await upsertExpedicao({
        pedido_id: form.pedido_id,
        status: form.status,
        tracking_code: form.tracking_code.trim() || null,
        data_envio: form.data_envio || null,
        data_entrega: form.data_entrega || null,
        observacoes: form.observacoes.trim() || null,
      } as any);
      addToast('Expedição salva.', 'success');
      close();
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar expedição.', 'error');
    } finally {
      setSaving(false);
    }
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

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">Nenhuma expedição cadastrada.</div>
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
                {rows.map((r) => {
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
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-700">Pedido</label>
            <select
              value={form.pedido_id}
              onChange={(e) => setForm((s) => ({ ...s, pedido_id: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">Selecione…</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.numero} — {o.cliente_nome}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as ExpedicaoStatus }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="separando">Separando</option>
                <option value="embalado">Embalado</option>
                <option value="enviado">Enviado</option>
                <option value="entregue">Entregue</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-700">Tracking</label>
              <input
                value={form.tracking_code}
                onChange={(e) => setForm((s) => ({ ...s, tracking_code: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
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
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={close} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">
              Cancelar
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
      </Modal>
    </div>
  );
}

