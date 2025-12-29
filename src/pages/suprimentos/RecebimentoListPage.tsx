import React, { useState, useEffect } from 'react';
import { cancelarRecebimento, deleteRecebimento, listRecebimentos, Recebimento } from '@/services/recebimento';
import { useNavigate } from 'react-router-dom';
import { Loader2, PackageCheck, AlertTriangle, CheckCircle, Clock, FileText, Trash2, RotateCcw, TrendingDown } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import { createContaPagarFromRecebimento, getContaPagarFromRecebimento } from '@/services/financeiro';

export default function RecebimentoListPage() {
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

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await listRecebimentos();
            setRecebimentos(data);
        } catch (error) {
            console.error('Erro ao carregar recebimentos:', error);
        } finally {
            setLoading(false);
        }
    };

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

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Recebimento de Mercadorias</h1>
                    <p className="text-gray-600">Gerencie a entrada e conferência de notas fiscais.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/app/suprimentos/recebimento-manual')}
                        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
                    >
                        <FileText size={18} />
                        Entrada Manual
                    </button>
                    <button
                        onClick={() => navigate('/app/nfe-input')}
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
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fornecedor / Cliente</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Total</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" /></td></tr>
                            ) : recebimentos.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">Nenhum recebimento registrado.</td></tr>
                            ) : (
                                recebimentos.map((rec) => (
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
                                                        title="Cancelar (estornar) recebimento"
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
                                                    <button
                                                        onClick={() => void handleCreateContaPagar(rec)}
                                                        disabled={creatingConta}
                                                        className="text-gray-400 hover:text-emerald-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                                                        title="Gerar Conta a Pagar"
                                                    >
                                                        {creatingConta ? <Loader2 className="animate-spin" size={16} /> : <TrendingDown size={16} />}
                                                    </button>
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
        </div>
    );
}
