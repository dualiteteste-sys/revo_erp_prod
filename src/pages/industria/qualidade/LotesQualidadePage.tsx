import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Blocks, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { useDebounce } from '@/hooks/useDebounce';
import {
  QualidadeLote,
  StatusQualidade,
  alterarStatusLote,
  listLotesQualidade
} from '@/services/industriaProducao';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';

const statusLabels: Record<StatusQualidade, string> = {
  aprovado: 'Aprovado',
  em_analise: 'Em análise',
  bloqueado: 'Bloqueado',
  reprovado: 'Reprovado'
};

const statusStyles: Record<StatusQualidade, string> = {
  aprovado: 'bg-green-100 text-green-700',
  em_analise: 'bg-amber-50 text-amber-700',
  bloqueado: 'bg-red-50 text-red-700',
  reprovado: 'bg-orange-100 text-orange-700'
};

type ModalState = {
  open: boolean;
  lote?: QualidadeLote | null;
};

export default function LotesQualidadePage() {
  const { addToast } = useToast();
  const [lotes, setLotes] = useState<QualidadeLote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [statusFilter, setStatusFilter] = useState<'todos' | StatusQualidade>('todos');
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [novoStatus, setNovoStatus] = useState<StatusQualidade>('aprovado');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadLotes = async () => {
    setLoading(true);
    try {
      const data = await listLotesQualidade(
        debouncedSearch || undefined,
        statusFilter === 'todos' ? undefined : statusFilter
      );
      setLotes(data);
    } catch (error: any) {
      addToast(error.message || 'Erro ao carregar lotes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter]);

  const resumo = useMemo(() => {
    const totals: Record<StatusQualidade, number> = {
      aprovado: 0,
      em_analise: 0,
      bloqueado: 0,
      reprovado: 0
    };
    let saldoBloqueado = 0;
    lotes.forEach(l => {
      totals[l.status_qa] += 1;
      if (l.status_qa !== 'aprovado') {
        saldoBloqueado += Number(l.saldo || 0);
      }
    });
    return { totals, saldoBloqueado };
  }, [lotes]);

  const openModal = (lote: QualidadeLote) => {
    setModal({ open: true, lote });
    setNovoStatus(lote.status_qa);
    setObservacoes('');
  };

  const handleAlterarStatus = async () => {
    if (!modal.lote) return;
    if (novoStatus === modal.lote.status_qa && !observacoes) {
      addToast('Selecione um novo status ou informe o motivo da atualização.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await alterarStatusLote(modal.lote.id, novoStatus, observacoes || undefined);
      addToast('Status atualizado com sucesso.', 'success');
      setModal({ open: false, lote: null });
      loadLotes();
    } catch (error: any) {
      addToast(error.message || 'Erro ao alterar status do lote.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderUltimaInspecao = (lote: QualidadeLote) => {
    if (!lote.ultima_inspecao_data) {
      return <span className="text-xs text-gray-400">Sem inspeções registradas</span>;
    }
    const data = new Date(lote.ultima_inspecao_data).toLocaleString();
    return (
      <div className="text-xs text-gray-600">
        <div className="font-semibold">{lote.ultima_inspecao_tipo || '—'} · {lote.ultima_inspecao_resultado || '—'}</div>
        <div>{data}</div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="text-blue-600" /> Lotes & Bloqueios
          </h1>
          <p className="text-sm text-gray-500">
            Controle os lotes bloqueados por qualidade e libere consumo/entrega apenas quando aprovados.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto ou lote..."
            className="border rounded-md px-3 py-2 text-sm w-64"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="todos">Todos</option>
            <option value="aprovado">Aprovados</option>
            <option value="em_analise">Em análise</option>
            <option value="bloqueado">Bloqueados</option>
            <option value="reprovado">Reprovados</option>
          </Select>
          <button
            className="inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm text-gray-600 hover:bg-gray-50"
            onClick={loadLotes}
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(resumo.totals) as StatusQualidade[]).map(status => (
          <div key={status} className="bg-white border rounded-lg p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${statusStyles[status]}`}>
              {resumo.totals[status]}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">{statusLabels[status]}</p>
              <p className="text-sm text-gray-700">{resumo.totals[status]} lote(s)</p>
            </div>
          </div>
        ))}
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center">
            <Blocks size={16} />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Saldo bloqueado</p>
            <p className="text-sm text-gray-700">{resumo.saldoBloqueado.toFixed(2)} un</p>
          </div>
        </div>
      </section>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
          Lista de lotes monitorados
        </div>
        {loading ? (
          <div className="py-12 flex items-center justify-center text-blue-600 gap-2">
            <Loader2 className="animate-spin" /> Carregando lotes...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Lote</th>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-left">Validade</th>
                  <th className="px-4 py-2 text-left">Saldo</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Última inspeção</th>
                  <th className="px-4 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map(lote => (
                  <tr key={lote.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{lote.lote}</div>
                      <div className="text-xs text-gray-500">ID: {lote.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{lote.produto_nome}</div>
                      <div className="text-xs text-gray-500">{lote.produto_id}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {lote.validade ? new Date(lote.validade).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{Number(lote.saldo || 0).toFixed(2)} un</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles[lote.status_qa]}`}>
                        {statusLabels[lote.status_qa]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {renderUltimaInspecao(lote)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        className="text-blue-600 hover:underline text-sm"
                        onClick={() => openModal(lote)}
                      >
                        Alterar status
                      </button>
                    </td>
                  </tr>
                ))}
                {lotes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-500 py-8">
                      Nenhum lote encontrado com os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        isOpen={modal.open}
        onClose={() => setModal({ open: false, lote: null })}
        title="Alterar status do lote"
        size="lg"
      >
        <div className="p-6 space-y-4">
          {modal.lote && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800">
              <div className="font-semibold">{modal.lote.lote}</div>
              <div>{modal.lote.produto_nome}</div>
              <div className="text-xs text-blue-600 mt-1">
                Status atual: {statusLabels[modal.lote.status_qa]}
              </div>
            </div>
          )}
          <Select
            label="Novo status"
            value={novoStatus}
            onChange={(e) => setNovoStatus(e.target.value as StatusQualidade)}
          >
            <option value="aprovado">Aprovado</option>
            <option value="em_analise">Em análise</option>
            <option value="bloqueado">Bloqueado</option>
            <option value="reprovado">Reprovado</option>
          </Select>
          <TextArea
            label="Observações"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Motivo da alteração..."
            rows={4}
          />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={() => setModal({ open: false, lote: null })}>
              Cancelar
            </Button>
            <Button onClick={handleAlterarStatus} disabled={saving}>
              {saving ? 'Atualizando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
