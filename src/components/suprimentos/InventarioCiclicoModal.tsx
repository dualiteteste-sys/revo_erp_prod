import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Loader2, ClipboardCheck, ClipboardList, RefreshCcw, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import {
  aprovarInventarioCiclico,
  createInventarioCiclico,
  getInventarioCiclico,
  InventarioCiclicoGetResponse,
  InventarioCiclicoListRow,
  listInventariosCiclicos,
  setInventarioCiclicoCount,
} from '@/services/inventarioCiclico';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  produtoIdsParaNovoInventario: string[];
  hasUpdatePermission: boolean;
  permsLoading?: boolean;
  onAjustesAplicados?: () => void;
};

function toNumberOrNull(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return value;
}

export default function InventarioCiclicoModal({
  isOpen,
  onClose,
  produtoIdsParaNovoInventario,
  hasUpdatePermission,
  permsLoading,
  onAjustesAplicados,
}: Props) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();

  const [tab, setTab] = useState<'inventarios' | 'contagem'>('inventarios');
  const [list, setList] = useState<InventarioCiclicoListRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<InventarioCiclicoGetResponse | null>(null);
  const [newNome, setNewNome] = useState('');
  const [creating, setCreating] = useState(false);

  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [busyProdutoId, setBusyProdutoId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const produtoIdsCountLabel = useMemo(() => produtoIdsParaNovoInventario.length, [produtoIdsParaNovoInventario.length]);

  const selectedListRow = useMemo(
    () => (selectedId ? list.find((r) => r.id === selectedId) ?? null : null),
    [list, selectedId]
  );

  const canUpdate = !permsLoading && hasUpdatePermission;

  const loadList = async () => {
    setLoadingList(true);
    try {
      const rows = await listInventariosCiclicos({ status: ['em_contagem', 'aprovado', 'cancelado'] });
      setList(rows);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar inventários.', 'error');
    } finally {
      setLoadingList(false);
    }
  };

  const loadDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await getInventarioCiclico(id);
      setDetail(data);
      setDraftCounts(
        Object.fromEntries(
          data.items.map((it) => [it.produto_id, it.quantidade_contada == null ? '' : String(it.quantidade_contada)])
        )
      );
      setTab('contagem');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar inventário.', 'error');
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setTab('inventarios');
    setSelectedId(null);
    setDetail(null);
    setDraftCounts({});
    setNewNome(`Inventário ${new Date().toLocaleDateString('pt-BR')}`);
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!selectedId) return;
    loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isOpen]);

  const handleCreate = async () => {
    if (!canUpdate) {
      addToast('Você não tem permissão para criar inventário.', 'warning');
      return;
    }
    if (!newNome.trim()) {
      addToast('Informe um nome para o inventário.', 'warning');
      return;
    }
    if (produtoIdsParaNovoInventario.length === 0) {
      addToast('Sem produtos na lista atual. Ajuste os filtros e tente novamente.', 'warning');
      return;
    }
    setCreating(true);
    try {
      const id = await createInventarioCiclico({ nome: newNome.trim(), produtoIds: produtoIdsParaNovoInventario });
      addToast('Inventário criado. Agora faça a contagem.', 'success');
      await loadList();
      setSelectedId(id);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao criar inventário.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveCount = async (produtoId: string) => {
    if (!detail?.header?.id) return;
    if (!canUpdate) return;
    if (detail.header.status !== 'em_contagem') return;

    const nextRaw = draftCounts[produtoId] ?? '';
    const nextValue = toNumberOrNull(nextRaw);

    const current = detail.items.find((it) => it.produto_id === produtoId);
    if (!current) return;

    const currentValue = current.quantidade_contada;
    const same =
      (nextValue == null && currentValue == null) ||
      (nextValue != null && currentValue != null && Number(nextValue) === Number(currentValue));
    if (same) return;

    setBusyProdutoId(produtoId);
    try {
      await setInventarioCiclicoCount({
        inventarioId: detail.header.id,
        produtoId,
        quantidadeContada: nextValue,
      });

      const saldoSistema = Number(current.saldo_sistema ?? 0);
      const divergencia = (nextValue ?? 0) - saldoSistema;

      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((it) =>
            it.produto_id !== produtoId
              ? it
              : {
                  ...it,
                  quantidade_contada: nextValue,
                  divergencia,
                  status: nextValue == null ? 'pendente' : 'contado',
                  updated_at: new Date().toISOString(),
                }
          ),
        };
      });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar contagem.', 'error');
    } finally {
      setBusyProdutoId(null);
    }
  };

  const handleApprove = async () => {
    if (!detail?.header?.id) return;
    if (!canUpdate) {
      addToast('Você não tem permissão para aprovar inventário.', 'warning');
      return;
    }
    if (detail.header.status !== 'em_contagem') return;

    const ok = await confirm({
      title: 'Aprovar inventário e ajustar estoque?',
      description:
        'Isso vai gerar movimentações de ajuste (entrada/saída) para itens contados com divergência. Essa ação é auditável.',
      confirmText: 'Aprovar e ajustar',
      cancelText: 'Cancelar',
      variant: 'warning',
    });
    if (!ok) return;

    setApproving(true);
    try {
      const res = await aprovarInventarioCiclico(detail.header.id);
      addToast(`Inventário aprovado. Ajustes gerados: ${res.ajustes}.`, 'success');
      await loadList();
      await loadDetail(detail.header.id);
      onAjustesAplicados?.();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao aprovar inventário.', 'error');
    } finally {
      setApproving(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'em_contagem') return <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">Em contagem</span>;
    if (status === 'aprovado') return <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700">Aprovado</span>;
    if (status === 'cancelado') return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">Cancelado</span>;
    return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{status}</span>;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Inventário cíclico" size="6xl">
      <div className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('inventarios')}
              className={`px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 ${
                tab === 'inventarios' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <ClipboardList size={16} />
              Inventários
            </button>
            <button
              type="button"
              onClick={() => setTab('contagem')}
              disabled={!detail}
              className={`px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 ${
                tab === 'contagem' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
              } ${!detail ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ClipboardCheck size={16} />
              Contagem
            </button>
          </div>
          <Button type="button" variant="secondary" onClick={loadList} className="gap-2" disabled={loadingList}>
            <RefreshCcw size={16} />
            Atualizar
          </Button>
        </div>

        {tab === 'inventarios' ? (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-4">
              <div className="font-semibold text-gray-800">Novo inventário</div>
              <div className="text-xs text-gray-500 mt-1">
                Usa os produtos da lista atual ({produtoIdsCountLabel}). Para incluir tudo, limpe os filtros antes.
              </div>
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-700">Nome</label>
                <input
                  value={newNome}
                  onChange={(e) => setNewNome(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex.: Inventário Janeiro"
                />
              </div>
              <div className="mt-4">
                <Button
                  type="button"
                  onClick={handleCreate}
                  className="w-full gap-2"
                  disabled={creating || permsLoading || !hasUpdatePermission}
                >
                  {creating ? <Loader2 className="animate-spin" size={16} /> : <ClipboardCheck size={16} />}
                  Criar e iniciar contagem
                </Button>
                {!permsLoading && !hasUpdatePermission ? (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2 mt-3">
                    Você não tem permissão para criar/aprovar inventário.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-800">Inventários recentes</div>
                  <div className="text-xs text-gray-500">Clique para abrir e continuar a contagem.</div>
                </div>
                {loadingList ? <Loader2 className="animate-spin text-blue-500" size={18} /> : null}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="p-3 text-left">Nome</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-right">Itens</th>
                      <th className="p-3 text-right">Contados</th>
                      <th className="p-3 text-right">Divergências</th>
                      <th className="p-3 text-right">Criado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {list.length === 0 && !loadingList ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-gray-500">
                          Nenhum inventário encontrado.
                        </td>
                      </tr>
                    ) : (
                      list.map((row) => (
                        <tr
                          key={row.id}
                          className={`cursor-pointer hover:bg-gray-50 ${selectedId === row.id ? 'bg-blue-50/40' : ''}`}
                          onClick={() => setSelectedId(row.id)}
                        >
                          <td className="p-3">
                            <div className="font-medium text-gray-900">{row.nome}</div>
                            <div className="text-xs text-gray-500">{row.id.slice(0, 8)}</div>
                          </td>
                          <td className="p-3">{statusBadge(row.status)}</td>
                          <td className="p-3 text-right">{row.itens_total}</td>
                          <td className="p-3 text-right">{row.itens_contados}</td>
                          <td className="p-3 text-right">{row.divergencias}</td>
                          <td className="p-3 text-right text-xs text-gray-500">
                            {new Date(row.created_at).toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            {!detail ? (
              <div className="p-10 text-center text-gray-500 border border-dashed rounded-xl">
                Selecione um inventário na aba “Inventários”.
              </div>
            ) : loadingDetail ? (
              <div className="p-10 text-center">
                <Loader2 className="animate-spin mx-auto text-blue-500" />
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-1 bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{detail.header.nome}</div>
                      <div className="text-xs text-gray-500 mt-1">{detail.header.id.slice(0, 8)}</div>
                    </div>
                    {statusBadge(detail.header.status)}
                  </div>

                  {selectedListRow ? (
                    <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Itens</div>
                        <div className="font-bold text-gray-900">{selectedListRow.itens_total}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Contados</div>
                        <div className="font-bold text-gray-900">{selectedListRow.itens_contados}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-500">Divergências</div>
                        <div className="font-bold text-gray-900">{selectedListRow.divergencias}</div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 text-xs text-gray-500">
                    Dica: conte os itens críticos primeiro. Divergência gera ajuste auditável ao aprovar.
                  </div>

                  <div className="mt-4">
                    <Button
                      type="button"
                      onClick={handleApprove}
                      className="w-full gap-2"
                      disabled={!canUpdate || approving || detail.header.status !== 'em_contagem'}
                    >
                      {approving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                      Aprovar e ajustar estoque
                    </Button>
                    {!canUpdate ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2 mt-3">
                        Sem permissão para aprovar/ajustar.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="xl:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-800">Itens</div>
                      <div className="text-xs text-gray-500">Preencha a contagem (salva ao sair do campo).</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="p-3 text-left">Produto</th>
                          <th className="p-3 text-left">SKU</th>
                          <th className="p-3 text-right">Saldo</th>
                          <th className="p-3 text-right">Contagem</th>
                          <th className="p-3 text-right">Divergência</th>
                          <th className="p-3 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {detail.items.map((it) => {
                          const inputValue = draftCounts[it.produto_id] ?? '';
                          const busy = busyProdutoId === it.produto_id;
                          const diver = Number(it.divergencia ?? 0);
                          const diverCls = diver === 0 ? 'text-gray-700' : diver > 0 ? 'text-green-700' : 'text-red-700';

                          return (
                            <tr key={it.id} className="hover:bg-gray-50">
                              <td className="p-3">
                                <div className="font-medium text-gray-900">{it.produto_nome}</div>
                                <div className="text-xs text-gray-500">{it.unidade}</div>
                              </td>
                              <td className="p-3 text-gray-700">{it.sku ?? '-'}</td>
                              <td className="p-3 text-right text-gray-900">{Number(it.saldo_sistema ?? 0)}</td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <input
                                    value={inputValue}
                                    onChange={(e) => setDraftCounts((prev) => ({ ...prev, [it.produto_id]: e.target.value }))}
                                    onBlur={() => handleSaveCount(it.produto_id)}
                                    disabled={!canUpdate || detail.header.status !== 'em_contagem'}
                                    inputMode="decimal"
                                    className="w-28 border border-gray-300 rounded-lg p-2 text-sm text-right focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                                    placeholder="0"
                                  />
                                  {busy ? <Loader2 className="animate-spin text-blue-500" size={16} /> : null}
                                </div>
                              </td>
                              <td className={`p-3 text-right font-semibold ${diverCls}`}>{diver}</td>
                              <td className="p-3">
                                {it.status === 'ajustado' ? (
                                  <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700">Ajustado</span>
                                ) : it.status === 'contado' ? (
                                  <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">Contado</span>
                                ) : (
                                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">Pendente</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

