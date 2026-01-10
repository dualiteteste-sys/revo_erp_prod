import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Loader2, PlusCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import Input from '@/components/ui/forms/Input';
import { getPartners, type PartnerListItem } from '@/services/partners';
import {
  deleteCobrancaServico,
  gerarContaAReceberParaCobranca,
  listCobrancasServico,
  listNotasServico,
  upsertCobrancaServico,
  type CobrancaServico,
  type CobrancaStatus,
  type NotaServico,
} from '@/services/servicosMvp';
import { useNumericField } from '@/hooks/useNumericField';

type FormState = {
  id: string | null;
  nota_id: string;
  cliente_id: string;
  data_vencimento: string;
  valor: number | null;
  status: CobrancaStatus;
};

const emptyForm: FormState = { id: null, nota_id: '', cliente_id: '', data_vencimento: '', valor: 0, status: 'pendente' };

export default function CobrancasServicosPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const [rows, setRows] = useState<CobrancaServico[]>([]);
  const [notas, setNotas] = useState<NotaServico[]>([]);
  const [clients, setClients] = useState<PartnerListItem[]>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const valorProps = useNumericField(form.valor, (value) => setForm((s) => ({ ...s, valor: value })));

  const notaById = useMemo(() => {
    const m = new Map<string, NotaServico>();
    for (const n of notas) m.set(n.id, n);
    return m;
  }, [notas]);

  const clientById = useMemo(() => {
    const m = new Map<string, PartnerListItem>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  async function load() {
    setLoading(true);
    try {
      const [cobs, ns, partners] = await Promise.all([
        listCobrancasServico(),
        listNotasServico(),
        getPartners({
          page: 1,
          pageSize: 200,
          searchTerm: '',
          filterType: null,
          sortBy: { column: 'nome', ascending: true },
        }),
      ]);
      setRows(cobs);
      setNotas(ns);
      setClients(partners.data.filter((p) => p.tipo === 'cliente' || p.tipo === 'ambos'));
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar cobranças.', 'error');
      setRows([]);
      setNotas([]);
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

  const openEdit = (row: CobrancaServico) => {
    setForm({
      id: row.id,
      nota_id: row.nota_id || '',
      cliente_id: row.cliente_id || '',
      data_vencimento: row.data_vencimento || '',
      valor: row.valor ?? 0,
      status: row.status,
    });
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
  };

  const save = async () => {
    const valor = Number(form.valor ?? 0);
    if (Number.isNaN(valor) || valor <= 0) {
      addToast('Valor inválido (deve ser > 0).', 'error');
      return;
    }
    if (!form.data_vencimento) {
      addToast('Informe a data de vencimento.', 'error');
      return;
    }
    setSaving(true);
    try {
      await upsertCobrancaServico({
        id: form.id || undefined,
        nota_id: form.nota_id || null,
        cliente_id: form.cliente_id || null,
        data_vencimento: form.data_vencimento,
        valor,
        status: form.status,
      } as any);
      addToast('Cobrança salva.', 'success');
      close();
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar cobrança.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCobrancaServico(id);
      addToast('Cobrança removida.', 'success');
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao remover cobrança.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const gerarConta = async (row: CobrancaServico) => {
    if (row.conta_a_receber_id) {
      addToast('Já existe conta a receber vinculada.', 'info');
      return;
    }
    setGeneratingId(row.id);
    try {
      const nota = row.nota_id ? notaById.get(row.nota_id) : null;
      const descricao = nota ? `Serviços: ${nota.descricao}` : 'Cobrança de serviço';
      const contaId = await gerarContaAReceberParaCobranca({
        cobrancaId: row.id,
        clienteId: row.cliente_id || null,
        descricao,
        valor: row.valor,
        dataVencimento: row.data_vencimento,
      });
      addToast(`Conta a receber gerada: ${contaId}`, 'success');
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao gerar conta a receber.', 'error');
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Banknote className="text-blue-600" /> Cobranças (Serviços)
          </h1>
          <p className="text-gray-600 text-sm mt-1">MVP: registrar cobrança e gerar conta a receber vinculada.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Nova Cobrança
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">Nenhuma cobrança cadastrada.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Nota</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Conta a receber</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((r) => {
                  const c = r.cliente_id ? clientById.get(r.cliente_id) : null;
                  const n = r.nota_id ? notaById.get(r.nota_id) : null;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{r.data_vencimento}</td>
                      <td className="px-4 py-3">{c?.nome || '-'}</td>
                      <td className="px-4 py-3">{n?.descricao || '-'}</td>
                      <td className="px-4 py-3">{Number(r.valor || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3">{r.conta_a_receber_id ? 'Vinculada' : '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(r)} className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
                            Editar
                          </button>
                          <button
                            onClick={() => gerarConta(r)}
                            disabled={generatingId === r.id}
                            className="px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {generatingId === r.id ? 'Gerando…' : 'Gerar A/R'}
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

      <Modal isOpen={isOpen} onClose={close} title="Cobrança (MVP)" size="4xl" bodyClassName="p-6 md:p-8">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Nota (opcional)</label>
              <select
                value={form.nota_id}
                onChange={(e) => setForm((s) => ({ ...s, nota_id: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="">(sem nota)</option>
                {notas.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.descricao}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-700">Cliente (opcional)</label>
              <select
                value={form.cliente_id}
                onChange={(e) => setForm((s) => ({ ...s, cliente_id: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="">(sem cliente)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Vencimento</label>
              <input
                type="date"
                value={form.data_vencimento}
                onChange={(e) => setForm((s) => ({ ...s, data_vencimento: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <Input label="Valor" name="valor" startAdornment="R$" inputMode="numeric" {...valorProps} disabled={saving} />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-700">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as CobrancaStatus }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="pendente">Pendente</option>
              <option value="paga">Paga</option>
              <option value="cancelada">Cancelada</option>
            </select>
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
