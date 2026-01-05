import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, PlusCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import { getPartners, type PartnerListItem } from '@/services/partners';
import { deleteContrato, listContratos, upsertContrato, type ServicoContrato, type ServicoContratoStatus } from '@/services/servicosMvp';

type FormState = {
  id: string | null;
  cliente_id: string;
  numero: string;
  descricao: string;
  valor_mensal: string;
  status: ServicoContratoStatus;
  data_inicio: string;
  data_fim: string;
  observacoes: string;
};

const emptyForm: FormState = {
  id: null,
  cliente_id: '',
  numero: '',
  descricao: '',
  valor_mensal: '0',
  status: 'ativo',
  data_inicio: '',
  data_fim: '',
  observacoes: '',
};

export default function ContratosPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<ServicoContrato[]>([]);
  const [clients, setClients] = useState<PartnerListItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const clientById = useMemo(() => {
    const m = new Map<string, PartnerListItem>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  async function load() {
    setLoading(true);
    try {
      const [contratos, partners] = await Promise.all([
        listContratos(),
        getPartners({
          page: 1,
          pageSize: 200,
          searchTerm: '',
          filterType: null,
          sortBy: { column: 'nome', ascending: true },
        }),
      ]);
      const eligible = partners.data.filter((p) => p.tipo === 'cliente' || p.tipo === 'ambos');
      setRows(contratos);
      setClients(eligible);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar contratos.', 'error');
      setRows([]);
      setClients([]);
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

  const openEdit = (row: ServicoContrato) => {
    setForm({
      id: row.id,
      cliente_id: row.cliente_id || '',
      numero: row.numero || '',
      descricao: row.descricao || '',
      valor_mensal: String(row.valor_mensal ?? 0),
      status: row.status,
      data_inicio: row.data_inicio || '',
      data_fim: row.data_fim || '',
      observacoes: row.observacoes || '',
    });
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.descricao.trim()) {
      addToast('Informe a descrição do contrato.', 'error');
      return;
    }
    const valor = Number(form.valor_mensal || 0);
    if (Number.isNaN(valor) || valor < 0) {
      addToast('Valor mensal inválido.', 'error');
      return;
    }
    setSaving(true);
    try {
      await upsertContrato({
        id: form.id || undefined,
        cliente_id: form.cliente_id || null,
        numero: form.numero.trim() || null,
        descricao: form.descricao.trim(),
        valor_mensal: valor,
        status: form.status,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        observacoes: form.observacoes.trim() || null,
      } as any);
      addToast('Contrato salvo.', 'success');
      close();
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar contrato.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteContrato(id);
      addToast('Contrato removido.', 'success');
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao remover contrato.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-blue-600" /> Contratos (Serviços)
          </h1>
          <p className="text-gray-600 text-sm mt-1">MVP: cadastro de contratos recorrentes.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Novo Contrato
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">Nenhum contrato cadastrado.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Valor mensal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((r) => {
                  const c = r.cliente_id ? clientById.get(r.cliente_id) : null;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{c?.nome || '-'}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.descricao}</td>
                      <td className="px-4 py-3">{Number(r.valor_mensal || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(r)} className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
                            Editar
                          </button>
                          <button
                            onClick={() => remove(r.id)}
                            disabled={deletingId === r.id}
                            className="px-3 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            {deletingId === r.id ? 'Removendo…' : 'Remover'}
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

      <Modal isOpen={isOpen} onClose={close} title="Contrato (MVP)" size="4xl" bodyClassName="p-6 md:p-8">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Cliente</label>
              <select
                value={form.cliente_id}
                onChange={(e) => setForm((s) => ({ ...s, cliente_id: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="">(opcional)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-700">Número</label>
              <input
                value={form.numero}
                onChange={(e) => setForm((s) => ({ ...s, numero: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-700">Descrição</label>
            <input
              value={form.descricao}
              onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Valor mensal</label>
              <input
                inputMode="decimal"
                value={form.valor_mensal}
                onChange={(e) => setForm((s) => ({ ...s, valor_mensal: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as ServicoContratoStatus }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="ativo">Ativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Início</label>
              <input
                type="date"
                value={form.data_inicio}
                onChange={(e) => setForm((s) => ({ ...s, data_inicio: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Fim</label>
              <input
                type="date"
                value={form.data_fim}
                onChange={(e) => setForm((s) => ({ ...s, data_fim: e.target.value }))}
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
