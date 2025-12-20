import React, { useState, useEffect } from 'react';
import {
    OrdemOperacao,
    getOperacoes,
    registrarEventoOperacao,
    transferirLoteOperacao
} from '../../../services/industriaProducao';
import { Button } from '../../ui/button';
import { Loader2, Play, Pause, CheckCircle, ArrowRight, ClipboardList, ShieldAlert } from 'lucide-react';
import { useToast } from '../../../contexts/ToastProvider';
import ApontamentoModal from './ApontamentoModal';
import Modal from '../../ui/Modal';
import DecimalInput from '../../ui/forms/DecimalInput';
import OperacaoQaModal from './OperacaoQaModal';
import RegistrarInspecaoModal from './RegistrarInspecaoModal';
import OperacaoDocsModal from './OperacaoDocsModal';
import { logger } from '@/lib/logger';

interface Props {
    ordemId: string;
}

export default function OperacoesGrid({ ordemId }: Props) {
    const [operacoes, setOperacoes] = useState<OrdemOperacao[]>([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    // Controle de modal de apontamento
    const [selectedOp, setSelectedOp] = useState<OrdemOperacao | null>(null);
    const [isApontamentoOpen, setIsApontamentoOpen] = useState(false);
    const [transferOp, setTransferOp] = useState<OrdemOperacao | null>(null);
    const [transferQty, setTransferQty] = useState<number>(0);
    const [transferLoading, setTransferLoading] = useState(false);
    const [qaOp, setQaOp] = useState<OrdemOperacao | null>(null);
    const [inspectionTipo, setInspectionTipo] = useState<'IP' | 'IF' | null>(null);
    const [inspectionOp, setInspectionOp] = useState<OrdemOperacao | null>(null);
    const [qaRefreshToken, setQaRefreshToken] = useState(0);
    const [docsOp, setDocsOp] = useState<OrdemOperacao | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getOperacoes(ordemId);
            setOperacoes(data);
            if (selectedOp) {
                const refreshed = data.find(item => item.id === selectedOp.id);
                if (refreshed) {
                    setSelectedOp(refreshed);
                }
            }
            if (qaOp) {
                const refreshedQa = data.find(item => item.id === qaOp.id);
                if (refreshedQa) {
                    setQaOp(refreshedQa);
                }
            }
        } catch (e: any) {
            logger.error('[Indústria][Produção] Falha ao carregar operações', e, { ordemId });
            addToast('Erro ao carregar operações', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [ordemId]);

    const handleEvento = async (op: OrdemOperacao, evento: 'iniciar' | 'pausar' | 'retomar' | 'concluir') => {
        if (evento === 'concluir') {
            if (!confirm(`Confirma a conclusão da etapa ${op.sequencia}?`)) return;
        }

        try {
            await registrarEventoOperacao(op.id, evento);
            addToast(`Operação ${evento === 'iniciar' ? 'iniciada' : evento} com sucesso.`, 'success');
            loadData();
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    const handleTransferConfirm = async () => {
        if (!transferOp) return;
        const disponivel = Math.max(transferOp.quantidade_produzida - (transferOp.quantidade_transferida || 0), 0);
        if (transferQty <= 0) {
            addToast('Informe uma quantidade válida para transferir.', 'error');
            return;
        }
        if (transferQty > disponivel) {
            addToast(`Quantidade excede o disponível (${disponivel}).`, 'error');
            return;
        }
        setTransferLoading(true);
        try {
            await transferirLoteOperacao(transferOp.id, transferQty);
            addToast('Lote transferido.', 'success');
            setTransferOp(null);
            setTransferQty(0);
            loadData();
        } catch (e: any) {
            addToast(e.message, 'error');
        } finally {
            setTransferLoading(false);
        }
    };

    const openTransferModal = (op: OrdemOperacao) => {
        const disponivel = Math.max(op.quantidade_produzida - (op.quantidade_transferida || 0), 0);
        setTransferOp(op);
        setTransferQty(disponivel);
    };

    const openQaModal = (op: OrdemOperacao) => {
        setQaOp(op);
    };

    const openDocsModal = (op: OrdemOperacao) => {
        setDocsOp(op);
    };

    const renderQaBadge = (label: string, required?: boolean, status?: string | null) => {
        if (!required) return <span className="text-xs text-gray-400">Livre</span>;
        if (!status) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700">
                    <ShieldAlert className="w-3 h-3" />
                    {label} pendente
                </span>
            );
        }
        const color = status === 'aprovada'
            ? 'bg-green-100 text-green-800'
            : status === 'reprovada'
                ? 'bg-red-100 text-red-700'
                : 'bg-yellow-100 text-yellow-800';
        const text = status === 'aprovada'
            ? `${label} aprovada`
            : status === 'reprovada'
                ? `${label} reprovada`
                : `${label} em análise`;
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${color}`}>
                {text}
            </span>
        );
    };

    if (loading) return <div className="p-4"><Loader2 className="animate-spin" /></div>;

    if (operacoes.length === 0) {
        return <div className="p-8 text-center text-gray-500">Nenhuma operação gerada. Libere a OP para gerar.</div>;
    }

    return (
        <div className="space-y-4">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Seq</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Centro de Trabalho</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Planejado</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Produzido (Boas)</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Refugo</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Transferido</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">A transferir</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">QA</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {operacoes.map((op) => {
                            const producao = op.quantidade_produzida || 0;
                            const transferida = op.quantidade_transferida || 0;
                            const disponivelTransferencia = producao - transferida;
                            const ipLiberado = !op.require_ip || op.ip_status === 'aprovada';
                            const ifLiberado = !op.require_if || op.if_status === 'aprovada';
                            const podeTransferir = op.permite_overlap && disponivelTransferencia > 0 && op.status !== 'concluida' && ipLiberado;

                            return (
                                <tr key={op.id}>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{op.sequencia}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                                        {op.centro_trabalho_nome}
                                        {op.permite_overlap && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1 rounded">Overlap</span>}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                      ${op.status === 'concluida' ? 'bg-green-100 text-green-800' :
                                                op.status === 'em_execucao' ? 'bg-blue-100 text-blue-800' :
                                                    op.status === 'pausada' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-gray-100 text-gray-800'}`}>
                                            {(op.status === 'na_fila' || op.status === 'pendente') ? 'Na Fila' :
                                                op.status === 'em_execucao' ? 'Executando' :
                                                    op.status === 'pausada' ? 'Pausada' : 'Concluída'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">{op.quantidade_planejada}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">{op.quantidade_produzida}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-red-600 text-right">{op.quantidade_refugo}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 text-right">{op.quantidade_transferida}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">{disponivelTransferencia}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm space-y-1">
                                        <div>{renderQaBadge('IP', op.require_ip, op.ip_status)}</div>
                                        <div>{renderQaBadge('IF', op.require_if, op.if_status)}</div>
                                        {op.require_ip && op.ip_status !== 'aprovada' && (
                                            <p className="text-xs text-red-500">IP pendente: libere para transferir.</p>
                                        )}
                                        {op.require_if && op.if_status !== 'aprovada' && (
                                            <p className="text-xs text-amber-600">IF necessária para concluir.</p>
                                        )}
                                        <Button size="xs" variant="ghost" className="text-blue-600" onClick={() => openQaModal(op)}>
                                            Configurar QA
                                        </Button>
                                        <Button size="xs" variant="ghost" className="text-blue-600" onClick={() => openDocsModal(op)}>
                                            Instruções / Docs
                                        </Button>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-center space-x-2">
                                        {/* Botões de Ação */}
                                        {(op.status === 'na_fila' || op.status === 'pendente' || op.status === 'pausada') && (
                                            <Button
                                                size="xs"
                                                variant={op.status === 'pausada' ? 'secondary' : 'success'}
                                                onClick={() => handleEvento(op, op.status === 'pausada' ? 'retomar' : 'iniciar')}
                                            >
                                                <Play className="w-3 h-3 mr-1" />
                                                {op.status === 'pausada' ? 'Retomar' : 'Iniciar'}
                                            </Button>
                                        )}

                                        {op.status === 'em_execucao' && (
                                            <>
                                                <Button size="xs" variant="secondary" onClick={() => handleEvento(op, 'pausar')}>
                                                    <Pause className="w-3 h-3 mr-1" />
                                                    Pausar
                                                </Button>
                                                <Button size="xs" onClick={() => { setSelectedOp(op); setIsApontamentoOpen(true); }}>
                                                    <ClipboardList className="w-3 h-3 mr-1" />
                                                    Apontar
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="outline"
                                                    disabled={!ifLiberado}
                                                    title={ifLiberado ? 'Concluir operação' : 'IF pendente: realize a inspeção final'}
                                                    onClick={() => ifLiberado && handleEvento(op, 'concluir')}
                                                >
                                                    <CheckCircle className="w-3 h-3 mr-1" />
                                                    Concluir
                                                </Button>
                                            </>
                                        )}

                                        {op.permite_overlap && disponivelTransferencia > 0 && op.status !== 'concluida' && (
                                            <Button
                                                size="xs"
                                                variant="ghost"
                                                className={`${podeTransferir ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 cursor-not-allowed'}`}
                                                title={podeTransferir ? `Transferir ${disponivelTransferencia}` : 'IP pendente: realize a inspeção para liberar'}
                                                disabled={!podeTransferir}
                                                onClick={() => podeTransferir && openTransferModal(op)}
                                            >
                                                <ArrowRight className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {selectedOp && (
                <ApontamentoModal
                    isOpen={isApontamentoOpen}
                    onClose={() => { setIsApontamentoOpen(false); setSelectedOp(null); }}
                    operacao={selectedOp}
                    onSuccess={loadData}
                />
            )}

            {qaOp && (
                <OperacaoQaModal
                    operacao={qaOp}
                    isOpen={!!qaOp}
                    onClose={() => setQaOp(null)}
                    onUpdated={loadData}
                    refreshToken={qaRefreshToken}
                    onRequestInspection={(tipo) => {
                        setInspectionTipo(tipo);
                        setInspectionOp(qaOp);
                    }}
                />
            )}

            {inspectionOp && inspectionTipo && (
                <RegistrarInspecaoModal
                    operacao={inspectionOp}
                    tipo={inspectionTipo}
                    isOpen={!!inspectionTipo}
                    onClose={() => {
                        setInspectionTipo(null);
                        setInspectionOp(null);
                    }}
                    onSuccess={() => {
                        setInspectionTipo(null);
                        setInspectionOp(null);
                        setQaRefreshToken(prev => prev + 1);
                        loadData();
                    }}
                />
            )}

            {transferOp && (
                <Modal
                    isOpen={!!transferOp}
                    onClose={() => { if (!transferLoading) { setTransferOp(null); setTransferQty(0); } }}
                    title={`Transferir lote - Seq ${transferOp.sequencia}`}
                    size="md"
                >
                    <div className="p-6 space-y-4">
                        <div className="bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded-md text-sm flex flex-wrap gap-4">
                            <div><strong>Produzido:</strong> {transferOp.quantidade_produzida}</div>
                            <div><strong>Transferido:</strong> {transferOp.quantidade_transferida}</div>
                            <div><strong>Disponível:</strong> {Math.max(transferOp.quantidade_produzida - (transferOp.quantidade_transferida || 0), 0)}</div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Quantidade a transferir</label>
                            <DecimalInput
                                precision={2}
                                value={transferQty}
                                onChange={setTransferQty}
                                className="mt-1"
                            />
                        </div>

                        <div className="flex justify-end space-x-2">
                            <Button variant="ghost" onClick={() => { if (!transferLoading) { setTransferOp(null); setTransferQty(0); } }} disabled={transferLoading}>
                                Cancelar
                            </Button>
                            <Button onClick={handleTransferConfirm} disabled={transferLoading}>
                                {transferLoading ? 'Transferindo...' : 'Confirmar Transferência'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {docsOp && (
                <OperacaoDocsModal
                    open={!!docsOp}
                    operacaoId={docsOp.id}
                    onClose={() => setDocsOp(null)}
                />
            )}
        </div>
    );
}
