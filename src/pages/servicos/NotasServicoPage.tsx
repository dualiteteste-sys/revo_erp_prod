import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PlusCircle, Receipt } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import {
  deleteNotaServico,
  listNotasServico,
  upsertNotaServico,
  type NotaServico,
  type NotaServicoStatus,
  listContratos,
  type ServicoContrato,
} from '@/services/servicosMvp';

type FormState = {
  id: string | null;
  contrato_id: string;
  competencia: string;
  descricao: string;
  valor: string;
  status: NotaServicoStatus;
};

const emptyForm: FormState = { id: null, contrato_id: '', competencia: '', descricao: '', valor: '0', status: 'rascunho' };

export default function NotasServicoPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<NotaServico[]>([]);
  const [contratos, setContratos] = useState<ServicoContrato[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const contratoById = useMemo(() => {
    const m = new Map<string, ServicoContrato>();
    for (const c of contratos) m.set(c.id, c);
    return m;
  }, [contratos]);

  async function load() {
    setLoading(true);
    try {
      const [notas, ctrs] = await Promise.all([listNotasServico(), listContratos()]);
      setRows(notas);
      setContratos(ctrs);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar notas de serviço.', 'error');
      setRows([]);
      setContratos([]);
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

  const openEdit = (row: NotaServico) => {
    setForm({
      id: row.id,
      contrato_id: row.contrato_id || '',
      competencia: row.competencia || '',
      descricao: row.descricao || '',
      valor: String(row.valor ?? 0),
      status: row.status,
    });
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.descricao.trim()) {
      addToast('Informe a descrição.', 'error');
      return;
    }
    const valor = Number(form.valor || 0);
    if (Number.isNaN(valor) || valor < 0) {
      addToast('Valor inválido.', 'error');
      return;
    }
    setSaving(true);
    try {
      await upsertNotaServico({
        id: form.id || undefined,
        contrato_id: form.contrato_id || null,
        competencia: form.competencia || null,
        descricao: form.descricao.trim(),
        valor,
        status: form.status,
      } as any);
      addToast('Nota salva.', 'success');
      close();
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar nota.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteNotaServico(id);
      addToast('Nota removida.', 'success');
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao remover nota.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Receipt className="text-blue-600" /> Notas de Serviço
          </h1>
          <p className="text-gray-600 text-sm mt-1">MVP: rascunho/emitida/cancelada (emissão fiscal futura).</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Nova Nota
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">Nenhuma nota cadastrada.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Competência</th>
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((r) => {
                  const c = r.contrato_id ? contratoById.get(r.contrato_id) : null;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{r.competencia || '-'}</td>
                      <td className="px-4 py-3">{c?.descricao || '-'}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.descricao}</td>
                      <td className="px-4 py-3">{Number(r.valor || 0).toFixed(2)}</td>
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

      <Modal isOpen={isOpen} onClose={close} title="Nota de Serviço (MVP)" size="4xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Contrato</label>
              <select
                value={form.contrato_id}
                onChange={(e) => setForm((s) => ({ ...s, contrato_id: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="">(opcional)</option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.descricao}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-700">Competência</label>
              <input
                type="date"
                value={form.competencia}
                onChange={(e) => setForm((s) => ({ ...s, competencia: e.target.value }))}
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
              <label className="text-sm text-gray-700">Valor</label>
              <input
                inputMode="decimal"
                value={form.valor}
                onChange={(e) => setForm((s) => ({ ...s, valor: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as NotaServicoStatus }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="rascunho">Rascunho</option>
                <option value="emitida">Emitida</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
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

