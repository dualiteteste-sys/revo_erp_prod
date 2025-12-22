import React, { useEffect, useRef, useState } from 'react';
import {
    OrdemOperacao,
    getOperacoes,
    registrarEventoOperacao,
    transferirLoteOperacao,
    resetOperacaoProducao
} from '../../../services/industriaProducao';
import { Button } from '../../ui/button';
import { Loader2, Play, Pause, CheckCircle, ArrowRight, ClipboardList, ShieldAlert, MoreHorizontal, Trash2, RotateCcw } from 'lucide-react';
import { useToast } from '../../../contexts/ToastProvider';
import ApontamentoModal from './ApontamentoModal';
import Modal from '../../ui/Modal';
import DecimalInput from '../../ui/forms/DecimalInput';
import OperacaoQaModal from './OperacaoQaModal';
import RegistrarInspecaoModal from './RegistrarInspecaoModal';
import OperacaoDocsModal from './OperacaoDocsModal';
import { logger } from '@/lib/logger';
import { useConfirm } from '@/contexts/ConfirmProvider';

interface Props {
    ordemId: string;
    highlightOperacaoId?: string | null;
    canOperate?: boolean;
    canConfigureQa?: boolean;
    canReset?: boolean;
}

export default function OperacoesGrid({ ordemId, highlightOperacaoId, canOperate = true, canConfigureQa = true, canReset = false }: Props) {
    const [operacoes, setOperacoes] = useState<OrdemOperacao[]>([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const tableRef = useRef<HTMLDivElement | null>(null);
    const btnSm = "h-8 px-3 text-xs";
    const btnPrimary = "bg-blue-600 text-white hover:bg-blue-700";
    const btnSecondary = "bg-gray-100 text-gray-800 hover:bg-gray-200";
    const btnSuccess = "bg-green-600 text-white hover:bg-green-700";
    const btnOutlineBlue = "border border-blue-200 text-blue-700 hover:bg-blue-50";

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
    const [menuOpId, setMenuOpId] = useState<string | null>(null);

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

    useEffect(() => {
        if (!highlightOperacaoId) return;
        const el = tableRef.current?.querySelector(`[data-operacao-id="${highlightOperacaoId}"]`) as HTMLElement | null;
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [highlightOperacaoId, operacoes.length]);

    const handleEvento = async (op: OrdemOperacao, evento: 'iniciar' | 'pausar' | 'retomar' | 'concluir') => {
        if (!canOperate) {
            addToast('Você não tem permissão para executar ações nesta operação.', 'error');
            return;
        }
        if (evento === 'concluir') {
            const ok = await confirm({
                title: 'Concluir etapa',
                description: `Confirma a conclusão da etapa ${op.sequencia}?`,
                confirmText: 'Concluir',
                cancelText: 'Cancelar',
                variant: 'primary',
            });
            if (!ok) return;
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
        if (!canOperate) {
            addToast('Você não tem permissão para transferir.', 'error');
            return;
        }
        const disponivel = Math.max(op.quantidade_produzida - (op.quantidade_transferida || 0), 0);
        setTransferOp(op);
        setTransferQty(disponivel);
    };

    const openQaModal = (op: OrdemOperacao) => {
        if (!canConfigureQa) {
            addToast('Você não tem permissão para configurar QA.', 'error');
            return;
        }
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
            <div ref={tableRef} className="overflow-x-auto">
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
                            {canReset && <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">⋯</th>}
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
                                <tr
                                    key={op.id}
                                    data-operacao-id={op.id}
                                    className={highlightOperacaoId === op.id ? 'bg-yellow-50 ring-2 ring-yellow-300 ring-inset' : undefined}
                                >
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
                                        <div className="flex flex-col gap-2 pt-1">
                                            <Button
                                                size="sm"
                                                className={`${btnSm} ${btnPrimary}`}
                                                onClick={() => openQaModal(op)}
                                                disabled={!canConfigureQa}
                                                title={!canConfigureQa ? 'Sem permissão para configurar QA' : 'Configurar QA'}
                                            >
                                                Configurar QA
                                            </Button>
                                            <Button
                                                size="sm"
                                                className={`${btnSm} ${btnPrimary}`}
                                                onClick={() => openDocsModal(op)}
                                            >
                                                Instruções / Docs
                                            </Button>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-sm">
                                        {/* Botões de Ação */}
                                        <div className="flex flex-wrap justify-center gap-2 min-w-[240px]">
                                            {(op.status === 'na_fila' || op.status === 'pendente' || op.status === 'pausada') && (
                                                <Button
                                                    size="sm"
                                                    className={`${btnSm} ${btnPrimary}`}
                                                    onClick={() => handleEvento(op, op.status === 'pausada' ? 'retomar' : 'iniciar')}
                                                    disabled={!canOperate}
                                                    title={!canOperate ? 'Sem permissão para operar' : undefined}
                                                >
                                                    <Play className="w-3 h-3 mr-1" />
                                                    {op.status === 'pausada' ? 'Retomar' : 'Iniciar'}
                                                </Button>
                                            )}

                                            {op.status === 'em_execucao' && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        className={`${btnSm} ${btnSecondary}`}
                                                        onClick={() => handleEvento(op, 'pausar')}
                                                        disabled={!canOperate}
                                                        title={!canOperate ? 'Sem permissão para operar' : undefined}
                                                    >
                                                        <Pause className="w-3 h-3 mr-1" />
                                                        Pausar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className={`${btnSm} ${btnPrimary}`}
                                                        disabled={!canOperate}
                                                        title={!canOperate ? 'Sem permissão para operar' : undefined}
                                                        onClick={() => {
                                                            if (!canOperate) return;
                                                            setSelectedOp(op);
                                                            setIsApontamentoOpen(true);
                                                        }}
                                                    >
                                                        <ClipboardList className="w-3 h-3 mr-1" />
                                                        Apontar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className={`${btnSm} ${btnSuccess}`}
                                                        disabled={!ifLiberado || !canOperate}
                                                        title={
                                                            !canOperate
                                                                ? 'Sem permissão para operar'
                                                                : (ifLiberado ? 'Concluir operação' : 'IF pendente: realize a inspeção final')
                                                        }
                                                        onClick={() => ifLiberado && handleEvento(op, 'concluir')}
                                                    >
                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                        Concluir
                                                    </Button>
                                                </>
                                            )}

                                            {op.permite_overlap && disponivelTransferencia > 0 && op.status !== 'concluida' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className={`${btnSm} ${btnOutlineBlue} ${!podeTransferir ? 'cursor-not-allowed opacity-60' : ''}`}
                                                    title={
                                                        !canOperate
                                                            ? 'Sem permissão para operar'
                                                            : (podeTransferir ? `Transferir ${disponivelTransferencia}` : 'IP pendente: realize a inspeção para liberar')
                                                    }
                                                    disabled={!podeTransferir || !canOperate}
                                                    onClick={() => podeTransferir && openTransferModal(op)}
                                                >
                                                    <ArrowRight className="w-3 h-3 mr-1" />
                                                    Transferir
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                    {canReset && (
                                      <td className="px-3 py-2 text-sm text-center relative">
                                        <div className="inline-flex relative">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className={`${btnSm} ${btnSecondary}`}
                                            onClick={() => setMenuOpId(menuOpId === op.id ? null : op.id)}
                                            title="Opções"
                                          >
                                            <MoreHorizontal className="w-4 h-4" />
                                          </Button>
                                          {menuOpId === op.id && (
                                            <div className="absolute right-0 top-9 z-20 w-64 rounded-md border border-gray-200 bg-white shadow-lg">
                                              <div className="py-1 text-sm text-gray-800">
                                                <button
                                                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100"
                                                  onClick={async () => {
                                                    setMenuOpId(null);
                                                    const ok = await confirm({
                                                      title: 'Excluir Operação',
                                                      description: 'Remove esta operação (sem apontamentos). Use quando foi gerada por engano.',
                                                      confirmText: 'Excluir',
                                                      cancelText: 'Cancelar',
                                                      variant: 'warning',
                                                    });
                                                    if (!ok) return;
                                                    try {
                                                      await resetOperacaoProducao(op.id, false);
                                                      addToast('Operação excluída.', 'success');
                                                      loadData();
                                                    } catch (e: any) {
                                                      addToast(String(e?.message || 'Erro ao excluir operação.'), 'error');
                                                    }
                                                  }}
                                                >
                                                  <RotateCcw className="w-4 h-4 text-amber-600" /> Excluir Operação
                                                </button>
                                                <button
                                                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 text-red-700"
                                                  onClick={async () => {
                                                    setMenuOpId(null);
                                                    const ok = await confirm({
                                                      title: 'Forçar reset (remove apontamentos)',
                                                      description: 'Remove apontamentos/QA desta operação e apaga a operação. Use apenas se foi gerada por engano.',
                                                      confirmText: 'Remover e resetar',
                                                      cancelText: 'Cancelar',
                                                      variant: 'danger',
                                                    });
                                                    if (!ok) return;
                                                    try {
                                                      await resetOperacaoProducao(op.id, true);
                                                      addToast('Operação e apontamentos removidos.', 'success');
                                                      loadData();
                                                    } catch (e: any) {
                                                      addToast(String(e?.message || 'Erro ao forçar reset.'), 'error');
                                                    }
                                                  }}
                                                >
                                                  <Trash2 className="w-4 h-4" /> Remover apontamentos e resetar
                                                </button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    )}
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
                            <Button
                                size="sm"
                                className={`${btnSm} ${btnSecondary}`}
                                onClick={() => { if (!transferLoading) { setTransferOp(null); setTransferQty(0); } }}
                                disabled={transferLoading}
                            >
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                className={`${btnSm} ${btnPrimary}`}
                                onClick={handleTransferConfirm}
                                disabled={transferLoading}
                            >
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
