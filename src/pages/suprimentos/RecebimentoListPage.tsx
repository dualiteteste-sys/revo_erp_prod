import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cancelarRecebimento, deleteRecebimento, listRecebimentoItens, listRecebimentos, Recebimento, type RecebimentoItem } from '@/services/recebimento';
import { useNavigate } from 'react-router-dom';
import { Loader2, PackageCheck, AlertTriangle, CheckCircle, Clock, FileText, Trash2, RotateCcw, TrendingDown } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import { createContaPagarFromRecebimento, getContaPagarFromRecebimento } from '@/services/financeiro';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import { listDepositos, type EstoqueDeposito } from '@/services/suprimentos';
import { applyDevolucaoFornecedor, createDevolucaoFornecedor } from '@/services/devolucaoFornecedor';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { useAuth } from '@/contexts/AuthProvider';

export default function RecebimentoListPage() {
    const { loading: authLoading, activeEmpresaId } = useAuth();
    const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [toDelete, setToDelete] = useState<Recebimento | null>(null);
    const [isCancelOpen, setIsCancelOpen] = useState(false);
    const [canceling, setCanceling] = useState(false);
    const [toCancel, setToCancel] = useState<Recebimento | null>(null);
    const [cancelMotivo, setCancelMotivo] = useState('');
    const [creatingConta, setCreatingConta] = useState(false);

    const [isDevolucaoOpen, setIsDevolucaoOpen] = useState(false);
    const [devolvendo, setDevolvendo] = useState(false);
    const [toDevolver, setToDevolver] = useState<Recebimento | null>(null);
    const [devolucaoMotivo, setDevolucaoMotivo] = useState('');
    const [devolucaoItens, setDevolucaoItens] = useState<RecebimentoItem[]>([]);
    const [devolucaoQtd, setDevolucaoQtd] = useState<Record<string, number>>({});
    const [depositos, setDepositos] = useState<EstoqueDeposito[]>([]);
    const [depositoId, setDepositoId] = useState<string | null>(null);
    const [sort, setSort] = useState<SortState<string>>({ column: 'data', direction: 'desc' });
    const [devSort, setDevSort] = useState<SortState<string>>({ column: 'produto', direction: 'asc' });

    const listColumns: TableColumnWidthDef[] = [
        { id: 'data', defaultWidth: 160, minWidth: 140 },
        { id: 'fornecedor', defaultWidth: 420, minWidth: 220 },
        { id: 'documento', defaultWidth: 220, minWidth: 180 },
        { id: 'valor_total', defaultWidth: 160, minWidth: 140 },
        { id: 'status', defaultWidth: 160, minWidth: 140 },
        { id: 'acoes', defaultWidth: 200, minWidth: 180 },
    ];
    const devColumns: TableColumnWidthDef[] = [
        { id: 'produto', defaultWidth: 420, minWidth: 240 },
        { id: 'nfe', defaultWidth: 220, minWidth: 160 },
        { id: 'qtd_recebida', defaultWidth: 160, minWidth: 140 },
        { id: 'qtd_devolver', defaultWidth: 160, minWidth: 140 },
    ];
    const { widths: listWidths, startResize: startResizeList } = useTableColumnWidths({ tableId: 'suprimentos:recebimentos', columns: listColumns });
    const { widths: devWidths, startResize: startResizeDev } = useTableColumnWidths({ tableId: 'suprimentos:recebimentos:devolucao', columns: devColumns });

    const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
    const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;

    const resetTenantLocalState = useCallback(() => {
        setIsDeleteOpen(false);
        setDeleting(false);
        setToDelete(null);
        setIsCancelOpen(false);
        setCanceling(false);
        setToCancel(null);
        setCancelMotivo('');
        setCreatingConta(false);

        setIsDevolucaoOpen(false);
        setDevolvendo(false);
        setToDevolver(null);
        setDevolucaoMotivo('');
        setDevolucaoItens([]);
        setDevolucaoQtd({});
        setDepositos([]);
        setDepositoId(null);
    }, []);

    useEffect(() => {
        const prevEmpresaId = lastEmpresaIdRef.current;
        if (prevEmpresaId === activeEmpresaId) return;

        // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
        resetTenantLocalState();
        setRecebimentos([]);
        setLoading(!!activeEmpresaId);

        lastEmpresaIdRef.current = activeEmpresaId;
    }, [activeEmpresaId, resetTenantLocalState]);

    const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);
    const effectiveRecebimentos = empresaChanged ? [] : recebimentos;

    const loadData = useCallback(async () => {
        if (!activeEmpresaId) {
            setRecebimentos([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const data = await listRecebimentos();
            setRecebimentos(data);
        } catch (error) {
            console.error('Erro ao carregar recebimentos:', error);
        } finally {
            setLoading(false);
        }
    }, [activeEmpresaId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const sortedRecebimentos = useMemo(() => {
        return sortRows(
            effectiveRecebimentos,
            sort as any,
            [
                { id: 'data', type: 'date', getValue: (r) => r.data_recebimento ?? null },
                { id: 'fornecedor', type: 'string', getValue: (r) => r.fiscal_nfe_imports?.emitente_nome ?? '' },
                {
                    id: 'documento',
                    type: 'string',
                    getValue: (r) =>
                        r.fiscal_nfe_imports?.numero
                            ? `NF ${r.fiscal_nfe_imports.numero}/${r.fiscal_nfe_imports.serie ?? ''}`
                            : '',
                },
                { id: 'valor_total', type: 'number', getValue: (r) => Number(r.fiscal_nfe_imports?.total_nf ?? 0) },
                { id: 'status', type: 'string', getValue: (r) => String(r.status ?? '') },
            ] as const
        );
    }, [effectiveRecebimentos, sort]);

    const sortedDevolucaoItens = useMemo(() => {
        return sortRows(
            devolucaoItens,
            devSort as any,
            [
                { id: 'produto', type: 'string', getValue: (it) => it.produtos?.nome ?? it.fiscal_nfe_import_items?.xprod ?? 'Item' },
                { id: 'nfe', type: 'string', getValue: (it) => `${it.fiscal_nfe_import_items?.cprod ?? ''} ${it.fiscal_nfe_import_items?.ean ?? ''}` },
                { id: 'qtd_recebida', type: 'number', getValue: (it) => Number(it.quantidade_conferida || it.quantidade_xml || 0) },
                { id: 'qtd_devolver', type: 'number', getValue: (it) => Number(devolucaoQtd[it.id] ?? 0) },
            ] as const
        );
    }, [devolucaoItens, devSort, devolucaoQtd]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pendente': return <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full flex items-center gap-1"><Clock size={12} /> Pendente</span>;
            case 'em_conferencia': return <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center gap-1"><PackageCheck size={12} /> Em Conferência</span>;
            case 'divergente': return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full flex items-center gap-1"><AlertTriangle size={12} /> Divergente</span>;
            case 'concluido': return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex items-center gap-1"><CheckCircle size={12} /> Concluído</span>;
            case 'cancelado': return <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full flex items-center gap-1"><AlertTriangle size={12} /> Cancelado</span>;
            default: return <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">{status}</span>;
        }
    };

    const openDelete = (rec: Recebimento) => {
        setToDelete(rec);
        setIsDeleteOpen(true);
    };

    const openCancel = (rec: Recebimento) => {
        setToCancel(rec);
        setCancelMotivo('');
        setIsCancelOpen(true);
    };

    const openDevolucao = async (rec: Recebimento) => {
        if (empresaChanged) return;
        setToDevolver(rec);
        setDevolucaoMotivo('');
        setDevolucaoQtd({});
        setDevolucaoItens([]);
        setDepositos([]);
        setDepositoId(null);
        setIsDevolucaoOpen(true);
        try {
            const [itens, deps] = await Promise.all([listRecebimentoItens(rec.id), listDepositos({ onlyActive: true })]);
            setDevolucaoItens(itens);
            const selectable = deps.filter((d) => d.ativo && d.can_move);
            setDepositos(selectable);
            setDepositoId(selectable.find((d) => d.is_default)?.id ?? selectable[0]?.id ?? null);
        } catch (e: any) {
            addToast(e.message || 'Falha ao carregar itens para devolução.', 'error');
        }
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        if (toDelete.status === 'concluido') {
            addToast('Recebimento concluído não pode ser excluído.', 'warning');
            setIsDeleteOpen(false);
            setToDelete(null);
            return;
        }
        setDeleting(true);
        try {
            await deleteRecebimento(toDelete.id);
            addToast('Recebimento excluído com sucesso.', 'success');
            setIsDeleteOpen(false);
            setToDelete(null);
            loadData();
        } catch (e: any) {
            addToast(e.message || 'Erro ao excluir recebimento.', 'error');
        } finally {
            setDeleting(false);
        }
    };

    const confirmCancel = async () => {
        if (!toCancel) return;
        setCanceling(true);
        try {
            await cancelarRecebimento(toCancel.id, cancelMotivo);
            addToast('Recebimento cancelado (estorno aplicado).', 'success');
            setIsCancelOpen(false);
            setToCancel(null);
            loadData();
        } catch (e: any) {
            addToast(e.message || 'Erro ao cancelar recebimento.', 'error');
        } finally {
            setCanceling(false);
        }
    };

    const handleCreateContaPagar = async (rec: Recebimento) => {
        setCreatingConta(true);
        try {
            const existing = await getContaPagarFromRecebimento(rec.id);
            const contaId =
                existing ||
                (await createContaPagarFromRecebimento({
                    recebimentoId: rec.id,
                    dataVencimento: null,
                }));
            addToast('Conta a pagar gerada com sucesso!', 'success');
            navigate(`/app/financeiro/contas-a-pagar?contaId=${encodeURIComponent(contaId)}`);
        } catch (e: any) {
            addToast(e?.message || 'Erro ao gerar conta a pagar.', 'error');
        } finally {
            setCreatingConta(false);
        }
    };

    const confirmDevolucao = async () => {
        if (!toDevolver) return;
        const itens = devolucaoItens
            .map((i) => ({ recebimentoItemId: i.id, quantidade: Number(devolucaoQtd[i.id] || 0) }))
            .filter((i) => i.quantidade > 0);

        if (itens.length === 0) {
            addToast('Selecione ao menos 1 item com quantidade > 0.', 'warning');
            return;
        }

        setDevolvendo(true);
        try {
            const devolucaoId = await createDevolucaoFornecedor({
                recebimentoId: toDevolver.id,
                depositoId,
                motivo: devolucaoMotivo || null,
                itens,
            });
            await applyDevolucaoFornecedor(devolucaoId);
            addToast('Devolução aplicada e estoque ajustado.', 'success');
            setIsDevolucaoOpen(false);
            setToDevolver(null);
            await loadData();
        } catch (e: any) {
            addToast(e.message || 'Erro ao aplicar devolução ao fornecedor.', 'error');
        } finally {
            setDevolvendo(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex justify-center h-full items-center">
                <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
            </div>
        );
    }

    if (!activeEmpresaId) {
        return <div className="p-4 text-gray-600">Selecione uma empresa para ver recebimentos.</div>;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Recebimento de Mercadorias</h1>
                    <p className="text-gray-600">Gerencie a entrada e conferência de notas fiscais.</p>
                </div>
                <div className="flex gap-3">
                    <CsvExportDialog
                        filename="recebimentos.csv"
                        rows={effectiveRecebimentos}
                        disabled={effectiveLoading}
                        columns={[
                            { key: 'data', label: 'Data', getValue: (r) => r.data_recebimento },
                            { key: 'fornecedor', label: 'Fornecedor/Cliente', getValue: (r) => r.fiscal_nfe_imports?.emitente_nome || '' },
                            { key: 'cnpj', label: 'CNPJ', getValue: (r) => r.fiscal_nfe_imports?.emitente_cnpj || '' },
                            { key: 'numero', label: 'Número', getValue: (r) => r.fiscal_nfe_imports?.numero || '' },
                            { key: 'serie', label: 'Série', getValue: (r) => r.fiscal_nfe_imports?.serie || '' },
                            { key: 'total', label: 'Total NF', getValue: (r) => r.fiscal_nfe_imports?.total_nf || '' },
                            { key: 'status', label: 'Status', getValue: (r) => r.status },
                        ]}
                    />
                    <button
                        onClick={() => navigate('/app/suprimentos/recebimento-manual')}
                        disabled={effectiveLoading}
                        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
                    >
                        <FileText size={18} />
                        Entrada Manual
                    </button>
                    <button
                        onClick={() => navigate('/app/nfe-input')}
                        disabled={effectiveLoading}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-bold shadow-sm"
                    >
                        <PackageCheck size={18} />
                        Importar XML
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <TableColGroup columns={listColumns} widths={listWidths} />
                        <thead className="bg-gray-50">
                            <tr>
                                <ResizableSortableTh columnId="data" label="Data" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeList as any} />
                                <ResizableSortableTh columnId="fornecedor" label="Fornecedor / Cliente" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeList as any} />
                                <ResizableSortableTh columnId="documento" label="Documento" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeList as any} />
                                <ResizableSortableTh columnId="valor_total" label="Valor Total" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeList as any} />
                                <ResizableSortableTh columnId="status" label="Status" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeList as any} />
                                <ResizableSortableTh columnId="acoes" label="Ações" align="right" sortable={false} resizable onResizeStart={startResizeList as any} />
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {effectiveLoading ? (
                                <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" /></td></tr>
                            ) : effectiveRecebimentos.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">Nenhum recebimento registrado.</td></tr>
                            ) : (
                                sortedRecebimentos.map((rec) => (
                                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {new Date(rec.data_recebimento).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                            {rec.fiscal_nfe_imports?.emitente_nome || 'Desconhecido'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {rec.fiscal_nfe_imports?.numero ? (
                                                <>Nº {rec.fiscal_nfe_imports.numero} <span className="text-xs text-gray-400">(Série {rec.fiscal_nfe_imports.serie})</span></>
                                            ) : (
                                                <span className="italic text-gray-400">Sem número</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                            R$ {rec.fiscal_nfe_imports?.total_nf?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(rec.status)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <button
                                                    onClick={() => {
                                                        const view = (rec.status === 'concluido' || rec.status === 'cancelado') ? '?view=details' : '';
                                                        navigate(`/app/suprimentos/recebimento/${rec.id}${view}`);
                                                    }}
                                                    className="text-blue-600 hover:text-blue-800 font-medium text-sm hover:underline"
                                                >
                                                    {rec.status === 'concluido' || rec.status === 'cancelado' ? 'Visualizar' : 'Conferir'}
                                                </button>
                                                {rec.status === 'concluido' ? (
                                                    <button
                                                        onClick={() => openCancel(rec)}
                                                        className="text-gray-400 hover:text-orange-600 transition-colors flex items-center gap-1"
                                                        title="Cancelar recebimento (estorno)"
                                                    >
                                                        <RotateCcw size={16} />
                                                    </button>
                                                ) : rec.status === 'cancelado' ? null : (
                                                    <button
                                                        onClick={() => openDelete(rec)}
                                                        className="text-gray-400 hover:text-red-600 transition-colors"
                                                        title="Excluir recebimento"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}

                                                {rec.status === 'concluido' ? (
                                                    <>
                                                        <button
                                                            onClick={() => void handleCreateContaPagar(rec)}
                                                            disabled={creatingConta}
                                                            className="text-gray-400 hover:text-emerald-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                                                            title="Gerar Conta a Pagar"
                                                        >
                                                            {creatingConta ? <Loader2 className="animate-spin" size={16} /> : <TrendingDown size={16} />}
                                                        </button>
                                                        <button
                                                            onClick={() => void openDevolucao(rec)}
                                                            className="text-gray-400 hover:text-blue-700 transition-colors flex items-center gap-1"
                                                            title="Devolver ao fornecedor (ajusta estoque)"
                                                        >
                                                            <RotateCcw size={16} />
                                                            <span className="text-xs">Dev.</span>
                                                        </button>
                                                    </>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmationModal
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={confirmDelete}
                title="Excluir recebimento"
                description={
                    toDelete?.status === 'concluido'
                        ? 'Este recebimento está concluído e, por padrão, não pode ser excluído.'
                        : `Tem certeza que deseja excluir o recebimento ${toDelete?.fiscal_nfe_imports?.numero ? `NF ${toDelete.fiscal_nfe_imports.numero}/${toDelete.fiscal_nfe_imports.serie}` : ''}?`
                }
                confirmText={toDelete?.status === 'concluido' ? 'Entendi' : 'Excluir'}
                isLoading={deleting}
                variant="danger"
            />

            <Modal
                isOpen={isCancelOpen}
                onClose={() => setIsCancelOpen(false)}
                title="Cancelar recebimento (estorno)"
                size="md"
            >
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-700">
                        Este recebimento está <b>concluído</b>. Ao cancelar, o sistema gera <b>estornos</b> para reverter a entrada no estoque e
                        marca o recebimento como <b>cancelado</b>.
                    </p>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
                        <textarea
                            value={cancelMotivo}
                            onChange={(e) => setCancelMotivo(e.target.value)}
                            rows={4}
                            className="w-full rounded-lg border border-gray-200 bg-white/70 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Ex.: NF-e importada errada / fornecedor incorreto / quantidade incorreta..."
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={() => setIsCancelOpen(false)}
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                            disabled={canceling}
                        >
                            Voltar
                        </button>
                        <button
                            onClick={confirmCancel}
                            disabled={canceling}
                            className="flex items-center gap-2 bg-orange-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-orange-700 disabled:opacity-50"
                        >
                            {canceling ? <Loader2 className="animate-spin" size={18} /> : null}
                            Cancelar recebimento
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isDevolucaoOpen}
                onClose={() => setIsDevolucaoOpen(false)}
                title="Devolução ao fornecedor"
                size="4xl"
            >
                <div className="p-6 space-y-4">
                    <div className="text-sm text-gray-700">
                        Gere uma devolução vinculada ao recebimento e ajuste o estoque de forma auditável.
                    </div>

                    {depositos.length > 0 ? (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Depósito (saída)</label>
                            <select
                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                value={depositoId ?? ''}
                                onChange={(e) => setDepositoId(e.target.value || null)}
                            >
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                        {d.is_default ? ' (padrão)' : ''}
                                    </option>
                                ))}
                            </select>
                            <div className="mt-1 text-xs text-gray-500">Use o depósito onde o recebimento foi lançado (padrão: depósito default).</div>
                        </div>
                    ) : (
                        <div className="text-xs text-gray-500">
                            Depósitos não configurados ou sem permissão de movimentação. A devolução usará o fluxo legado quando aplicável.
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
                        <textarea
                            value={devolucaoMotivo}
                            onChange={(e) => setDevolucaoMotivo(e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-gray-200 bg-white/70 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Ex.: devolução por avaria / divergência / troca..."
                        />
                    </div>

                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">Itens</div>
                        <div className="max-h-[50vh] overflow-auto">
                            <table className="min-w-full text-sm">
                                <TableColGroup columns={devColumns} widths={devWidths} />
                                <thead className="bg-white sticky top-0 z-10">
                                    <tr className="text-left text-gray-500 border-b">
                                        <ResizableSortableTh columnId="produto" label="Produto" className="p-3 normal-case tracking-normal" sort={devSort as any} onSort={(col) => setDevSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeDev as any} />
                                        <ResizableSortableTh columnId="nfe" label="NF-e" className="p-3 normal-case tracking-normal" sort={devSort as any} onSort={(col) => setDevSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeDev as any} />
                                        <ResizableSortableTh columnId="qtd_recebida" label="Qtd. recebida" align="right" className="p-3 normal-case tracking-normal" sort={devSort as any} onSort={(col) => setDevSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeDev as any} />
                                        <ResizableSortableTh columnId="qtd_devolver" label="Qtd. devolver" align="right" className="p-3 normal-case tracking-normal" sort={devSort as any} onSort={(col) => setDevSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeDev as any} />
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {sortedDevolucaoItens.map((it) => {
                                        const max = Number(it.quantidade_conferida || it.quantidade_xml || 0);
                                        const current = devolucaoQtd[it.id] ?? 0;
                                        return (
                                            <tr key={it.id}>
                                                <td className="p-3">
                                                    <div className="font-medium text-gray-800">{it.produtos?.nome ?? it.fiscal_nfe_import_items?.xprod ?? 'Item'}</div>
                                                    <div className="text-xs text-gray-500">SKU: {it.produtos?.sku ?? '-'}</div>
                                                </td>
                                                <td className="p-3 text-xs text-gray-500">
                                                    {it.fiscal_nfe_import_items?.cprod ?? '-'} / {it.fiscal_nfe_import_items?.ean ?? '-'}
                                                </td>
                                                <td className="p-3 text-right text-gray-700">{max}</td>
                                                <td className="p-3 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={max}
                                                        step="0.01"
                                                        value={current}
                                                        onChange={(e) => {
                                                            const next = Number(e.target.value || 0);
                                                            setDevolucaoQtd((s) => ({ ...s, [it.id]: Math.max(0, Math.min(next, max)) }));
                                                        }}
                                                        className="w-28 p-2 border border-gray-300 rounded-lg text-right"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={() => setIsDevolucaoOpen(false)}
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                            disabled={devolvendo}
                        >
                            Voltar
                        </button>
                        <button
                            onClick={confirmDevolucao}
                            disabled={devolvendo}
                            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {devolvendo ? <Loader2 className="animate-spin" size={18} /> : null}
                            Aplicar devolução
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
