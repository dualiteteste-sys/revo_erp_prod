import React, { useEffect, useState } from 'react';
import { Loader2, PlusCircle, Store } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import PedidoVendaFormPanel from '@/components/vendas/PedidoVendaFormPanel';
import { listContasCorrentes, type ContaCorrente } from '@/services/treasury';
import { finalizePdv } from '@/services/vendasMvp';
import { supabase } from '@/lib/supabaseClient';

type PdvRow = {
  id: string;
  numero: number;
  status: string;
  total_geral: number;
  data_emissao: string;
  updated_at: string;
};

const sb = supabase as any;

export default function PdvPage() {
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PdvRow[]>([]);
  const [contas, setContas] = useState<ContaCorrente[]>([]);
  const [contaCorrenteId, setContaCorrenteId] = useState<string>('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [{ data: contaData }, { data: pdvData, error: pdvError }] = await Promise.all([
        listContasCorrentes({ page: 1, pageSize: 50, searchTerm: '', ativo: true }),
        sb
          .from('vendas_pedidos')
          .select('id,numero,status,total_geral,data_emissao,updated_at')
          .eq('canal', 'pdv')
          .order('updated_at', { ascending: false })
          .limit(200),
      ]);

      if (pdvError) throw pdvError;
      setContas(contaData);
      if (!contaCorrenteId && contaData.length > 0) {
        const padrao = contaData.find((c) => c.padrao_para_recebimentos) || contaData[0];
        setContaCorrenteId(padrao.id);
      }
      setRows((pdvData || []) as any);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar PDV.', 'error');
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
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const openEdit = (id: string) => {
    setSelectedId(id);
    setIsFormOpen(true);
  };

  const close = () => {
    setIsFormOpen(false);
    setSelectedId(null);
  };

  const handleSaveSuccess = () => {
    void load();
  };

  const handleFinalize = async (pedidoId: string) => {
    if (!contaCorrenteId) {
      addToast('Cadastre/seleciona uma conta corrente para receber no PDV.', 'error');
      return;
    }
    setFinalizingId(pedidoId);
    try {
      await finalizePdv({ pedidoId, contaCorrenteId, estoqueEnabled: true });
      addToast('PDV finalizado (financeiro + estoque).', 'success');
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao finalizar PDV.', 'error');
    } finally {
      setFinalizingId(null);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Store className="text-blue-600" /> PDV
          </h1>
          <p className="text-gray-600 text-sm mt-1">Venda rápida: finaliza gerando movimentação (entrada) e baixa de estoque.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Nova venda
        </button>
      </div>

      <div className="mb-4 flex items-center gap-3 flex-shrink-0">
        <label className="text-sm text-gray-700">Conta para recebimento</label>
        <select
          value={contaCorrenteId}
          onChange={(e) => setContaCorrenteId(e.target.value)}
          className="p-2 border border-gray-300 rounded-lg min-w-[280px]"
        >
          <option value="">Selecione…</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} {c.apelido ? `(${c.apelido})` : ''}
            </option>
          ))}
        </select>
        <button onClick={() => load()} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">
          Atualizar
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">
            Nenhuma venda PDV finalizada ainda. Clique em “Nova venda”.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">#{r.numero}</td>
                    <td className="px-4 py-3">{r.data_emissao}</td>
                    <td className="px-4 py-3">{r.status}</td>
                    <td className="px-4 py-3">{Number(r.total_geral || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(r.id)} className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
                          Abrir
                        </button>
                        <button
                          onClick={() => handleFinalize(r.id)}
                          disabled={finalizingId === r.id}
                          className="px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {finalizingId === r.id ? 'Finalizando…' : 'Finalizar'}
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

      <Modal isOpen={isFormOpen} onClose={close} title={selectedId ? 'Editar venda' : 'Nova venda'} size="6xl">
        <PedidoVendaFormPanel vendaId={selectedId} onSaveSuccess={handleSaveSuccess} onClose={close} />
      </Modal>
    </div>
  );
}

