import React, { useRef, useState, useEffect } from 'react';
import {
  EstoqueDeposito,
  EstoqueMovimento,
  EstoquePosicao,
  getKardex,
  getKardexV2,
  listDepositos,
  listPosicaoEstoque,
  listPosicaoEstoqueV2,
} from '@/services/suprimentos';
import { Search, ArrowRightLeft, History, Download, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import MovimentoModal from '@/components/suprimentos/MovimentoModal';
import { useDebounce } from '@/hooks/useDebounce';
import Toggle from '@/components/ui/forms/Toggle';
import { useSearchParams } from 'react-router-dom';
import { downloadCsv } from '@/utils/csv';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { useHasPermission } from '@/hooks/useHasPermission';
import InventarioCiclicoModal from '@/components/suprimentos/InventarioCiclicoModal';
import VirtualizedTableBody from '@/components/ui/VirtualizedTableBody';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

export default function EstoquePage() {
  const [produtos, setProdutos] = useState<EstoquePosicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showBaixoEstoque, setShowBaixoEstoque] = useState(false);
  const debouncedSearch = useDebounce(search, 500);
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingFocusTerm, setPendingFocusTerm] = useState<string | null>(null);
  const [highlightProdutoId, setHighlightProdutoId] = useState<string | null>(null);

  const [depositos, setDepositos] = useState<EstoqueDeposito[]>([]);
  const [depositoId, setDepositoId] = useState<string | null>(null);

  const [selectedProduto, setSelectedProduto] = useState<EstoquePosicao | null>(null);
  const [isMovimentoOpen, setIsMovimentoOpen] = useState(false);
  const [isKardexOpen, setIsKardexOpen] = useState(false);
  const [kardexData, setKardexData] = useState<EstoqueMovimento[]>([]);
  const [loadingKardex, setLoadingKardex] = useState(false);
  const [isInventarioOpen, setIsInventarioOpen] = useState(false);
  const { addToast } = useToast();
  const permViewV2 = useHasPermission('estoque', 'view');
  const canUseV2 = !permViewV2.isLoading && !!permViewV2.data;

  const permUpdateV2 = useHasPermission('estoque', 'update');
  const permUpdateLegacy = useHasPermission('suprimentos', 'update');
  const canUpdate = !!permUpdateV2.data || !!permUpdateLegacy.data;
  const permsLoading = permUpdateV2.isLoading || permUpdateLegacy.isLoading;

  const selectedDeposito = depositos.find((d) => d.id === depositoId) ?? depositos.find((d) => d.is_default) ?? null;
  const [sort, setSort] = useState<SortState<string>>({ column: 'nome', direction: 'asc' });

  const fetchDepositos = async () => {
    if (!canUseV2) {
      setDepositos([]);
      setDepositoId(null);
      return;
    }
    try {
      const deps = await listDepositos({ onlyActive: true });
      setDepositos(deps);

      const selectable = deps.filter((d) => d.ativo && d.can_view);
      const nextDefault =
        selectable.find((d) => d.is_default)?.id ?? selectable[0]?.id ?? deps.find((d) => d.is_default)?.id ?? deps[0]?.id ?? null;
      setDepositoId((current) => {
        if (current && selectable.some((d) => d.id === current)) return current;
        return nextDefault;
      });
    } catch {
      // fallback: segue sem multi-depósito
      setDepositos([]);
      setDepositoId(null);
    }
  };

  const fetchEstoque = async () => {
    setLoading(true);
    try {
      const data = canUseV2
        ? await listPosicaoEstoqueV2({
            search: debouncedSearch || null,
            baixoEstoque: showBaixoEstoque,
            depositoId,
          })
        : await listPosicaoEstoque(debouncedSearch || undefined, showBaixoEstoque);
      setProdutos(data);
    } catch (error) {
      addToast('Falha ao carregar estoque. Tente novamente.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepositos();
  }, [canUseV2]);

  useEffect(() => {
    fetchEstoque();
  }, [debouncedSearch, showBaixoEstoque, depositoId, canUseV2]);

  useEffect(() => {
    const produto = searchParams.get('produto');
    if (produto) {
      setSearch(produto);
      setPendingFocusTerm(produto.toLowerCase());
      const next = new URLSearchParams(searchParams);
      next.delete('produto');
      setSearchParams(next, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingFocusTerm || loading) return;
    const match = produtos.find(p =>
      p.nome.toLowerCase().includes(pendingFocusTerm) ||
      (p.sku && p.sku.toLowerCase().includes(pendingFocusTerm))
    );
    if (!match) return;
    setHighlightProdutoId(match.produto_id);
    const timeout = window.setTimeout(() => setHighlightProdutoId(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [pendingFocusTerm, produtos, loading]);

  const handleOpenMovimento = (produto: EstoquePosicao) => {
    if (!permsLoading && !canUpdate) {
      addToast('Você não tem permissão para movimentar estoque.', 'warning');
      return;
    }
    setSelectedProduto(produto);
    setIsMovimentoOpen(true);
  };

  const handleOpenKardex = async (produto: EstoquePosicao) => {
    setSelectedProduto(produto);
    setIsKardexOpen(true);
    setLoadingKardex(true);
    try {
      const data = canUseV2
        ? await getKardexV2(produto.produto_id, { depositoId, limit: 50 })
        : await getKardex(produto.produto_id, 50);
      setKardexData(data);
    } catch {
      addToast('Falha ao carregar kardex. Tente novamente.', 'error');
      setKardexData([]);
    } finally {
      setLoadingKardex(false);
    }
  };

  const handleExportEstoqueCsv = () => {
    if (produtos.length === 0) {
      addToast('Nada para exportar.', 'warning');
      return;
    }
    downloadCsv({
      filename: `estoque_posicao_${selectedDeposito?.nome ?? 'deposito'}_${new Date().toISOString().slice(0, 10)}`,
      headers: ['deposito', 'produto', 'sku', 'unidade', 'saldo', 'custo_medio', 'estoque_min', 'status'],
      rows: produtos.map((p) => [
        selectedDeposito?.nome ?? '',
        p.nome,
        p.sku ?? '',
        p.unidade,
        p.saldo,
        p.custo_medio,
        p.estoque_min ?? '',
        p.status_estoque,
      ]),
    });
  };

  const handleExportKardexCsv = () => {
    if (!selectedProduto) return;
    if (kardexData.length === 0) {
      addToast('Nada para exportar.', 'warning');
      return;
    }
    downloadCsv({
      filename: `kardex_${selectedProduto.nome}_${new Date().toISOString().slice(0, 10)}`,
      headers: ['deposito', 'data', 'tipo', 'qtd', 'saldo_anterior', 'saldo_novo', 'ref', 'usuario'],
      rows: kardexData.map((m) => [
        m.deposito_nome ?? selectedDeposito?.nome ?? '',
        new Date(m.created_at).toLocaleString('pt-BR'),
        m.tipo,
        m.quantidade,
        m.saldo_anterior,
        m.saldo_novo,
        m.documento_ref ?? m.observacao ?? '',
        m.usuario_email ?? '',
      ]),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'zerado': return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-semibold">Zerado</span>;
      case 'baixo': return <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-semibold">Baixo</span>;
      default: return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-semibold">OK</span>;
    }
  };

  // Tipos de movimento que somam ao estoque
  const entryTypes = ['entrada', 'ajuste_entrada', 'entrada_beneficiamento', 'transfer_in'];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columns: TableColumnWidthDef[] = [
    { id: 'produto', defaultWidth: 0, minWidth: 320 },
    { id: 'saldo', defaultWidth: 180, minWidth: 160 },
    { id: 'status', defaultWidth: 160, minWidth: 140 },
    { id: 'acoes', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'suprimentos:estoque', columns });

  const statusOrder: Record<string, number> = { zerado: 0, baixo: 1, ok: 2 };

  const sortedProdutos = React.useMemo(() => {
    const dir = sort?.direction === 'desc' ? -1 : 1;
    const col = sort?.column || 'nome';
    const rows = [...produtos];

    rows.sort((a, b) => {
      if (col === 'saldo') {
        return dir * (Number(a.saldo || 0) - Number(b.saldo || 0));
      }
      if (col === 'status') {
        const av = statusOrder[a.status_estoque] ?? 999;
        const bv = statusOrder[b.status_estoque] ?? 999;
        return dir * (av - bv);
      }
      // produto: usa nome como primário e sku como secundário
      const an = String(a.nome || '').toLocaleLowerCase();
      const bn = String(b.nome || '').toLocaleLowerCase();
      if (an !== bn) return dir * an.localeCompare(bn, 'pt-BR');
      const as = String(a.sku || '').toLocaleLowerCase();
      const bs = String(b.sku || '').toLocaleLowerCase();
      return dir * as.localeCompare(bs, 'pt-BR');
    });

    return rows;
  }, [produtos, sort]);

  const handleSort = (column: string) => {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: 'asc' };
      return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  return (
    <div className="p-4">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Controle de Estoque</h1>
          <p className="text-gray-600 text-sm mt-1">
            Gerencie saldos e movimentações{selectedDeposito ? ` • Depósito: ${selectedDeposito.nome}` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsInventarioOpen(true)}
            className="gap-2"
          >
            Inventário cíclico
          </Button>
          <Button type="button" variant="secondary" onClick={handleExportEstoqueCsv} className="gap-2">
            <Download size={18} />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6 items-end">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar produto (Nome ou SKU)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {depositos.length > 0 ? (
          <div className="bg-white p-2 rounded-lg border border-gray-200 min-w-[220px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="deposito">
              Depósito
            </label>
            <select
              id="deposito"
              className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              value={depositoId ?? ''}
              onChange={(e) => setDepositoId(e.target.value || null)}
            >
              {depositos
                .filter((d) => d.ativo && d.can_view)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                    {d.is_default ? ' (padrão)' : ''}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
        <div className="bg-white p-2 rounded-lg border border-gray-200">
            <Toggle 
                label="Apenas Estoque Baixo/Zerado" 
                name="baixoEstoque" 
                checked={showBaixoEstoque} 
                onChange={setShowBaixoEstoque} 
            />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div ref={scrollRef} className="overflow-auto max-h-[70vh]">
          <table className="min-w-[960px] w-full divide-y divide-gray-200 table-fixed">
            <TableColGroup columns={columns} widths={widths} />
            <thead className="bg-gray-50">
              <tr>
                <ResizableSortableTh
                  columnId="produto"
                  label="Produto"
                  sort={sort}
                  onSort={() => handleSort('produto')}
                  onResizeStart={startResize}
                />
                <ResizableSortableTh
                  columnId="saldo"
                  label="Saldo"
                  sort={sort}
                  onSort={() => handleSort('saldo')}
                  onResizeStart={startResize}
                />
                <ResizableSortableTh
                  columnId="status"
                  label="Status"
                  sort={sort}
                  onSort={() => handleSort('status')}
                  onResizeStart={startResize}
                />
                <ResizableSortableTh
                  columnId="acoes"
                  label={<span className="sr-only">Ações</span>}
                  sortable={false}
                  onResizeStart={startResize}
                  align="right"
                  className="px-6"
                />
              </tr>
            </thead>
            {loading ? (
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td colSpan={4} className="p-8 text-center">
                    <Loader2 className="animate-spin mx-auto text-blue-500" />
                  </td>
                </tr>
              </tbody>
            ) : produtos.length === 0 ? (
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td colSpan={4} className="p-8 text-center">
                    <div className="text-gray-500">Nenhum produto encontrado.</div>
                    {search || showBaixoEstoque ? (
                      <button
                        type="button"
                        className="mt-3 text-sm text-blue-600 hover:underline"
                        onClick={() => {
                          setSearch('');
                          setShowBaixoEstoque(false);
                        }}
                      >
                        Limpar filtros
                      </button>
                    ) : null}
                  </td>
                </tr>
              </tbody>
            ) : (
              <VirtualizedTableBody
                scrollParentRef={scrollRef}
                rowCount={sortedProdutos.length}
                rowHeight={72}
                colSpan={4}
                className="bg-white divide-y divide-gray-200"
                renderRow={(index) => {
                  const prod = sortedProdutos[index];
                  const isHighlighted = highlightProdutoId === prod.produto_id;
                  return (
                    <tr
                      key={prod.produto_id}
                      className={`h-[72px] transition-colors ${isHighlighted ? 'bg-amber-50/70 ring-1 ring-amber-200' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 truncate" title={prod.nome}>{prod.nome}</div>
                        <div className="text-xs text-gray-500">SKU: {prod.sku || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-lg font-bold text-gray-800">{prod.saldo}</span>
                        <span className="text-xs text-gray-500 ml-1">{prod.unidade}</span>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(prod.status_estoque)}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenMovimento(prod)}
                          className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg disabled:opacity-50 disabled:hover:bg-transparent"
                          title={!permsLoading && !canUpdate ? 'Sem permissão para movimentar estoque' : 'Nova Movimentação'}
                          disabled={permsLoading || !canUpdate}
                        >
                          <ArrowRightLeft size={18} />
                        </button>
                        <button
                          onClick={() => handleOpenKardex(prod)}
                          className="text-gray-600 hover:bg-gray-100 p-2 rounded-lg"
                          title="Histórico (Kardex)"
                        >
                          <History size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                }}
              />
            )}
          </table>
        </div>
      </div>

      {selectedProduto && (
        <MovimentoModal 
            isOpen={isMovimentoOpen} 
            onClose={() => setIsMovimentoOpen(false)} 
            produto={selectedProduto}
            onSuccess={fetchEstoque}
            depositos={depositos.filter((d) => d.can_view)}
            depositoId={depositoId}
        />
      )}

      <Modal isOpen={isKardexOpen} onClose={() => setIsKardexOpen(false)} title={`Kardex: ${selectedProduto?.nome}`} size="4xl">
        <div className="p-6">
            <div className="flex justify-end mb-3">
              <Button type="button" variant="secondary" onClick={handleExportKardexCsv} disabled={loadingKardex || kardexData.length === 0} className="gap-2">
                <Download size={18} />
                Exportar CSV
              </Button>
            </div>
            {loadingKardex ? (
                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500" /></div>
            ) : kardexData.length === 0 ? (
                <div className="text-center text-gray-500 p-8">Nenhuma movimentação registrada.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-3 text-left">Data</th>
                                <th className="p-3 text-left">Tipo</th>
                                <th className="p-3 text-right">Qtd.</th>
                                <th className="p-3 text-right">Saldo Anterior</th>
                                <th className="p-3 text-right">Novo Saldo</th>
                                <th className="p-3 text-left">Ref.</th>
                                <th className="p-3 text-left">Usuário</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {kardexData.map(mov => (
                                <tr key={mov.id}>
                                    <td className="p-3">{new Date(mov.created_at).toLocaleString('pt-BR')}</td>
                                    <td className="p-3 capitalize">
                                        {mov.tipo === 'entrada_beneficiamento' 
                                            ? 'Entrada Benef.' 
                                            : mov.tipo === 'transfer_in'
                                              ? 'Transferência (Entrada)'
                                              : mov.tipo === 'transfer_out'
                                                ? 'Transferência (Saída)'
                                            : mov.tipo.replace(/_/g, ' ')}
                                    </td>
                                    <td className={`p-3 text-right font-bold ${entryTypes.includes(mov.tipo) ? 'text-green-600' : 'text-red-600'}`}>
                                        {entryTypes.includes(mov.tipo) ? '+' : '-'}{mov.quantidade}
                                    </td>
                                    <td className="p-3 text-right text-gray-500">{mov.saldo_anterior}</td>
                                    <td className="p-3 text-right font-semibold">{mov.saldo_novo}</td>
                                    <td className="p-3 text-gray-600 max-w-xs truncate" title={mov.observacao || ''}>
                                        {mov.documento_ref || mov.observacao || '-'}
                                    </td>
                                    <td className="p-3 text-gray-500 text-xs">{mov.usuario_email}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      </Modal>

      <InventarioCiclicoModal
        isOpen={isInventarioOpen}
        onClose={() => setIsInventarioOpen(false)}
        produtoIdsParaNovoInventario={produtos.map((p) => p.produto_id)}
        hasUpdatePermission={canUpdate}
        permsLoading={permsLoading}
        onAjustesAplicados={fetchEstoque}
      />
    </div>
  );
}
