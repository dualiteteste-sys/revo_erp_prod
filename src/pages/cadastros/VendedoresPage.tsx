import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PlusCircle, Search, UserSquare } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import * as vendedoresService from '@/services/vendedores';

type FormState = {
  id: string | null;
  nome: string;
  email: string;
  telefone: string;
  comissao_percent: string;
  ativo: boolean;
};

const emptyForm: FormState = {
  id: null,
  nome: '',
  email: '',
  telefone: '',
  comissao_percent: '0',
  ativo: true,
};

export default function VendedoresPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<vendedoresService.Vendedor[]>([]);
  const [search, setSearch] = useState('');
  const [ativoOnly, setAtivoOnly] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (ativoOnly && !r.ativo) return false;
      if (!q) return true;
      return r.nome.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q);
    });
  }, [rows, search, ativoOnly]);

  async function load() {
    setLoading(true);
    try {
      const data = await vendedoresService.listVendedores(undefined, false);
      setRows(data);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar vendedores.', 'error');
      setRows([]);
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

  const openEdit = (row: vendedoresService.Vendedor) => {
    setForm({
      id: row.id,
      nome: row.nome || '',
      email: row.email || '',
      telefone: row.telefone || '',
      comissao_percent: String(row.comissao_percent ?? 0),
      ativo: !!row.ativo,
    });
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.nome.trim()) {
      addToast('Informe o nome do vendedor.', 'error');
      return;
    }
    const comissao = Number(form.comissao_percent || 0);
    if (Number.isNaN(comissao) || comissao < 0) {
      addToast('Comissão inválida.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (!form.id) {
        await vendedoresService.createVendedor({
          nome: form.nome.trim(),
          email: form.email.trim() || null,
          telefone: form.telefone.trim() || null,
          comissao_percent: comissao,
          ativo: form.ativo,
        });
        addToast('Vendedor criado.', 'success');
      } else {
        await vendedoresService.updateVendedor(form.id, {
          nome: form.nome.trim(),
          email: form.email.trim() || null,
          telefone: form.telefone.trim() || null,
          comissao_percent: comissao,
          ativo: form.ativo,
        });
        addToast('Vendedor atualizado.', 'success');
      }
      close();
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar vendedor.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await vendedoresService.deleteVendedor(id);
      addToast('Vendedor removido.', 'success');
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao remover vendedor.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <UserSquare className="text-blue-600" /> Vendedores
          </h1>
          <p className="text-gray-600 text-sm mt-1">Cadastro básico para comissões e atribuição em vendas.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Novo Vendedor
        </button>
      </div>

      <div className="mb-4 flex gap-4 flex-shrink-0">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
          <input type="checkbox" checked={ativoOnly} onChange={(e) => setAtivoOnly(e.target.checked)} />
          Somente ativos
        </label>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">Nenhum vendedor encontrado.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Comissão (%)</th>
                  <th className="px-4 py-3">Ativo</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.nome}</td>
                    <td className="px-4 py-3">{r.email || '-'}</td>
                    <td className="px-4 py-3">{r.telefone || '-'}</td>
                    <td className="px-4 py-3">{Number(r.comissao_percent || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">{r.ativo ? 'Sim' : 'Não'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(r)}
                          className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200"
                        >
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={isOpen}
        onClose={close}
        title={form.id ? 'Editar Vendedor' : 'Novo Vendedor'}
        bodyClassName="p-6 md:p-8"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-700">Nome</label>
            <input
              value={form.nome}
              onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Telefone</label>
              <input
                value={form.telefone}
                onChange={(e) => setForm((s) => ({ ...s, telefone: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Comissão (%)</label>
              <input
                inputMode="decimal"
                value={form.comissao_percent}
                onChange={(e) => setForm((s) => ({ ...s, comissao_percent: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-6 select-none">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((s) => ({ ...s, ativo: e.target.checked }))} />
              Ativo
            </label>
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
