import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PlusCircle, Undo2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import { getVendaDetails, listVendas, type VendaDetails, type VendaPedido } from '@/services/vendas';
import { createDevolucaoWithSideEffects, listDevolucoes, type Devolucao } from '@/services/vendasMvp';
import { listContasCorrentes, type ContaCorrente } from '@/services/treasury';

type ItemState = {
  produto_id: string;
  produto_nome: string;
  quantidade: string;
  valor_unitario: string;
  selected: boolean;
};

type FormState = {
  pedido_id: string;
  motivo: string;
  conta_corrente_id: string;
  itens: ItemState[];
};

const emptyForm: FormState = { pedido_id: '', motivo: '', conta_corrente_id: '', itens: [] };

export default function DevolucoesPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<(Devolucao & { itens: any[] })[]>([]);
  const [orders, setOrders] = useState<VendaPedido[]>([]);
  const [contas, setContas] = useState<ContaCorrente[]>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loadingPedido, setLoadingPedido] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [devs, ord, cc] = await Promise.all([
        listDevolucoes(),
        listVendas({ search: '', status: 'concluido', limit: 500, offset: 0 }),
        listContasCorrentes({ page: 1, pageSize: 50, searchTerm: '', ativo: true }),
      ]);
      setRows(devs as any);
      setOrders(ord);
      setContas(cc.data);
      if (!form.conta_corrente_id && cc.data.length > 0) {
        const padrao = cc.data.find((c) => c.padrao_para_pagamentos) || cc.data[0];
        setForm((s) => ({ ...s, conta_corrente_id: padrao.id }));
      }
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar devoluções.', 'error');
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

  const orderById = useMemo(() => {
    const map = new Map<string, VendaPedido>();
    for (const o of orders) map.set(o.id, o);
    return map;
  }, [orders]);

  const openNew = () => {
    setForm((s) => ({ ...emptyForm, conta_corrente_id: s.conta_corrente_id }));
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setForm((s) => ({ ...emptyForm, conta_corrente_id: s.conta_corrente_id }));
  };

  const loadPedidoItens = async (pedidoId: string) => {
    setLoadingPedido(true);
    try {
      const venda: VendaDetails = await getVendaDetails(pedidoId);
      const itens: ItemState[] = (venda.itens || []).map((it) => ({
        produto_id: it.produto_id,
        produto_nome: it.produto_nome || it.produto_id,
        quantidade: String(it.quantidade || 0),
        valor_unitario: String(it.preco_unitario || 0),
        selected: true,
      }));
      setForm((s) => ({ ...s, pedido_id: pedidoId, itens }));
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar itens do pedido.', 'error');
      setForm((s) => ({ ...s, pedido_id: pedidoId, itens: [] }));
    } finally {
      setLoadingPedido(false);
    }
  };

  const save = async () => {
    if (!form.pedido_id) {
      addToast('Selecione um pedido.', 'error');
      return;
    }
    if (!form.conta_corrente_id) {
      addToast('Selecione uma conta corrente.', 'error');
      return;
    }
    const itens = form.itens
      .filter((i) => i.selected)
      .map((i) => ({
        produto_id: i.produto_id,
        quantidade: Number(i.quantidade || 0),
        valor_unitario: Number(i.valor_unitario || 0),
      }))
      .filter((i) => i.quantidade > 0 && i.valor_unitario >= 0);

    if (itens.length === 0) {
      addToast('Selecione ao menos 1 item com quantidade válida.', 'error');
      return;
    }

    setSaving(true);
    try {
      const id = await createDevolucaoWithSideEffects({
        pedidoId: form.pedido_id,
        motivo: form.motivo.trim() || null,
        itens,
        contaCorrenteId: form.conta_corrente_id,
      });
      addToast(`Devolução criada: ${id}`, 'success');
      close();
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao criar devolução.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Undo2 className="text-blue-600" /> Devoluções de Venda
          </h1>
          <p className="text-gray-600 text-sm mt-1">MVP: registra devolução + entrada no estoque + estorno financeiro.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Nova Devolução
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">Nenhuma devolução cadastrada.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((r) => {
                  const o = orderById.get(r.pedido_id);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{r.data_devolucao}</td>
                      <td className="px-4 py-3">{o ? `#${o.numero} — ${o.cliente_nome}` : r.pedido_id}</td>
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3">{Number(r.valor_total || 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={close} title="Nova devolução (MVP)" size="5xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Pedido (concluído)</label>
              <select
                value={form.pedido_id}
                onChange={(e) => void loadPedidoItens(e.target.value)}
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
            <div>
              <label className="text-sm text-gray-700">Conta para estorno</label>
              <select
                value={form.conta_corrente_id}
                onChange={(e) => setForm((s) => ({ ...s, conta_corrente_id: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="">Selecione…</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} {c.apelido ? `(${c.apelido})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-700">Motivo</label>
            <input
              value={form.motivo}
              onChange={(e) => setForm((s) => ({ ...s, motivo: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm font-semibold text-gray-700 mb-2">Itens</div>
            {loadingPedido ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="animate-spin h-4 w-4" /> Carregando…
              </div>
            ) : form.itens.length === 0 ? (
              <div className="text-sm text-gray-500">Selecione um pedido para listar os itens.</div>
            ) : (
              <div className="overflow-auto max-h-[320px]">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-2">Sel.</th>
                      <th className="py-2 pr-2">Produto</th>
                      <th className="py-2 pr-2">Qtd</th>
                      <th className="py-2 pr-2">Vl. Unit.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {form.itens.map((it, idx) => (
                      <tr key={`${it.produto_id}-${idx}`}>
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={it.selected}
                            onChange={(e) =>
                              setForm((s) => ({
                                ...s,
                                itens: s.itens.map((x, i) => (i === idx ? { ...x, selected: e.target.checked } : x)),
                              }))
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">{it.produto_nome}</td>
                        <td className="py-2 pr-2">
                          <input
                            inputMode="decimal"
                            value={it.quantidade}
                            onChange={(e) =>
                              setForm((s) => ({
                                ...s,
                                itens: s.itens.map((x, i) => (i === idx ? { ...x, quantidade: e.target.value } : x)),
                              }))
                            }
                            className="w-24 p-2 border border-gray-300 rounded-lg"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            inputMode="decimal"
                            value={it.valor_unitario}
                            onChange={(e) =>
                              setForm((s) => ({
                                ...s,
                                itens: s.itens.map((x, i) => (i === idx ? { ...x, valor_unitario: e.target.value } : x)),
                              }))
                            }
                            className="w-28 p-2 border border-gray-300 rounded-lg"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              {saving ? 'Processando…' : 'Registrar devolução'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
