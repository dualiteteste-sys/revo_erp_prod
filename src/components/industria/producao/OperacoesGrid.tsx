import React, { useState, useEffect } from 'react';
import {
    OrdemOperacao,
    getOperacoes,
    registrarEventoOperacao,
    transferirLoteOperacao
} from '../../../services/industriaProducao';
import { Button } from '../../ui/button';
import { Loader2, Play, Pause, CheckCircle, ArrowRight, ClipboardList } from 'lucide-react';
import { useToast } from '../../../contexts/ToastProvider';
import ApontamentoModal from './ApontamentoModal';

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

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getOperacoes(ordemId);
            setOperacoes(data);
        } catch (e: any) {
            console.error(e);
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

    const handleTransferir = async (op: OrdemOperacao) => {
        // Regra: Transferir tudo que ja produziu menos o que ja transferiu?
        // Ou prompt de quantidade?
        // O user disse: "ação “Transferir lote parcial” aparece quando houver boas >= lote_transferência... move apenas o delta"
        // Vamos calcular o delta disponível e sugerir, ou transferir tudo disponivel.
        // Simplificação: Transferir delta disponível (Produzida - Transferida).

        const disponivel = op.quantidade_produzida - op.quantidade_transferida;
        if (disponivel <= 0) {
            addToast('Nada disponível para transferir.', 'warning');
            return;
        }

        if (!confirm(`Confirma transferir ${disponivel} unidades para a próxima etapa?`)) return;

        try {
            await transferirLoteOperacao(op.id, disponivel);
            addToast('Lote transferido.', 'success');
            loadData();
        } catch (e: any) {
            addToast(e.message, 'error');
        }
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
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {operacoes.map((op) => {
                            const disponivelTransferencia = op.quantidade_produzida - op.quantidade_transferida;
                            const podeTransferir = op.permite_overlap && disponivelTransferencia > 0 && op.status !== 'concluida'; // Se concluida auto transfere? Ou manual? Pela regra do DB, se concluir auto-transfere, mas se tiver overlap e não concluiu, pode transferir manual.

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
                                                <Button size="xs" variant="outline" onClick={() => handleEvento(op, 'concluir')}>
                                                    <CheckCircle className="w-3 h-3 mr-1" />
                                                    Concluir
                                                </Button>
                                            </>
                                        )}

                                        {podeTransferir && (
                                            <Button size="xs" variant="ghost" className="text-blue-600 hover:text-blue-800" title={`Transferir ${disponivelTransferencia}`} onClick={() => handleTransferir(op)}>
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
        </div>
    );
}
