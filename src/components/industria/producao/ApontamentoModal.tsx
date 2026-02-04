import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../../ui/Modal';
import { Button } from '../../ui/button';
import Input from '../../ui/forms/Input';
import Select from '../../ui/forms/Select';
import {
    OrdemOperacao,
    apontarProducao,
    getMotivosRefugo,
    QualidadeMotivo,
    listApontamentos,
    deleteApontamento
} from '../../../services/industriaProducao';
import { useToast } from '../../../contexts/ToastProvider';
import DecimalInput from '../../ui/forms/DecimalInput';
import NovoMotivoModal from '../qualidade/NovoMotivoModal';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useConfirm } from '@/contexts/ConfirmProvider';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    operacao: OrdemOperacao;
    onSuccess: () => void;
}

export default function ApontamentoModal({ isOpen, onClose, operacao, onSuccess }: Props) {
    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const [loading, setLoading] = useState(false);
    const [qtdBoa, setQtdBoa] = useState(0);
    const [qtdRefugo, setQtdRefugo] = useState(0);
    const [motivoRefugoId, setMotivoRefugoId] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [finalizar, setFinalizar] = useState(false);
    const [motivosRefugo, setMotivosRefugo] = useState<QualidadeMotivo[]>([]);
    const [isNewMotivoOpen, setIsNewMotivoOpen] = useState(false);
    const [apontamentos, setApontamentos] = useState<any[]>([]);
    const [apontamentosLoading, setApontamentosLoading] = useState(false);
    const [apontamentosSort, setApontamentosSort] = useState<SortState<string>>({ column: 'data', direction: 'desc' });

    const apontamentosColumns: TableColumnWidthDef[] = [
        { id: 'data', defaultWidth: 220, minWidth: 200 },
        { id: 'boas', defaultWidth: 120, minWidth: 90 },
        { id: 'refugo', defaultWidth: 120, minWidth: 90 },
        { id: 'motivo', defaultWidth: 220, minWidth: 160 },
        { id: 'obs', defaultWidth: 420, minWidth: 160 },
        { id: 'acoes', defaultWidth: 120, minWidth: 100 },
    ];
    const { widths: apontamentosWidths, startResize: startApontamentosResize } = useTableColumnWidths({
        tableId: 'industria:producao:apontamentos',
        columns: apontamentosColumns,
    });
    const sortedApontamentos = useMemo(() => {
        return sortRows(
            apontamentos,
            apontamentosSort as any,
            [
                { id: 'data', type: 'date', getValue: (r) => r.created_at },
                { id: 'boas', type: 'number', getValue: (r) => r.quantidade_boa ?? r.quantidade_produzida ?? 0 },
                { id: 'refugo', type: 'number', getValue: (r) => r.quantidade_refugo ?? 0 },
                { id: 'motivo', type: 'string', getValue: (r) => r.motivo_refugo ?? '' },
                { id: 'obs', type: 'string', getValue: (r) => r.observacoes ?? '' },
            ] as const
        );
    }, [apontamentos, apontamentosSort]);

    const saldoRestante = useMemo(() => {
        const max = operacao.quantidade_planejada ?? 0;
        return Math.max(max - ((operacao as any).quantidade_produzida ?? 0) - operacao.quantidade_refugo, 0);
    }, [operacao]);

    const loadMotivos = () => {
        getMotivosRefugo()
            .then(setMotivosRefugo)
            .catch((err) => {
                logger.error('[Indústria][Produção] Falha ao carregar motivos de refugo', err, { operacaoId: operacao.id });
                addToast('Erro ao carregar motivos de refugo.', 'error');
            });
    };

    const loadApontamentos = async () => {
        setApontamentosLoading(true);
        try {
            const data = await listApontamentos(operacao.id);
            setApontamentos(data);
        } catch (err: any) {
            logger.error('[Indústria][Produção] Falha ao carregar apontamentos', err, { operacaoId: operacao.id });
            addToast(err?.message || 'Erro ao carregar apontamentos.', 'error');
        } finally {
            setApontamentosLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadMotivos();
            loadApontamentos();
            setQtdBoa(0);
            setQtdRefugo(0);
            setMotivoRefugoId('');
            setObservacoes('');
        }
    }, [isOpen]);

    const handleSave = async () => {
        if (qtdBoa <= 0 && qtdRefugo <= 0) {
            addToast('Informe uma quantidade boa ou refugo.', 'error');
            return;
        }
        if (qtdRefugo > 0 && !motivoRefugoId) {
            addToast('Informe o motivo do refugo.', 'error');
            return;
        }
        const maxDisponivel =
            operacao.quantidade_planejada - (((operacao as any).quantidade_produzida ?? 0) as number) - operacao.quantidade_refugo;
        if (qtdBoa + qtdRefugo > maxDisponivel && maxDisponivel > 0) {
            addToast(`Quantidade ultrapassa o planejado restante (${maxDisponivel}).`, 'error');
            return;
        }

        setLoading(true);
        try {
            // Find description for legacy field
            const motivoDesc = motivosRefugo.find(m => m.id === motivoRefugoId)?.descricao || '';

            await apontarProducao(
                operacao.id,
                qtdBoa,
                qtdRefugo,
                motivoDesc,
                observacoes,
                finalizar,
                motivoRefugoId
            );
            addToast('Apontamento realizado com sucesso!', 'success');
            onSuccess();
            loadApontamentos();
            setQtdBoa(0);
            setQtdRefugo(0);
            setMotivoRefugoId('');
            setObservacoes('');
        } catch (e: any) {
            addToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteApontamento = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir apontamento',
            description: 'Tem certeza que deseja excluir este apontamento? Esta ação não pode ser desfeita.',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await deleteApontamento(id);
            addToast('Apontamento removido.', 'success');
            loadApontamentos();
            onSuccess();
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Apontar Produção - Seq ${operacao.sequencia} ${operacao.centro_trabalho_nome || ''}`}
            size="80pct"
        >
            <div className="space-y-6 p-6">
                <div className="bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded-md text-sm flex flex-wrap gap-4">
                    <div><strong>Planejado:</strong> {operacao.quantidade_planejada}</div>
                    <div><strong>Produzido:</strong> {(operacao as any).quantidade_produzida ?? 0}</div>
                    <div><strong>Refugo:</strong> {operacao.quantidade_refugo}</div>
                    <div><strong>Saldo disponível:</strong> {saldoRestante}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Qtd. Boa</label>
                        <DecimalInput
                            value={qtdBoa}
                            onChange={setQtdBoa}
                            precision={2}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Qtd. Refugo</label>
                        <DecimalInput
                            value={qtdRefugo}
                            onChange={setQtdRefugo}
                            precision={2}
                            className="mt-1"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Motivo do Refugo</label>
                    <div className="flex gap-2">
                        <div className="flex-grow">
                            <Select
                                value={motivoRefugoId}
                                onChange={(e) => setMotivoRefugoId(e.target.value)}
                                disabled={qtdRefugo <= 0}
                            >
                                <option value="">Selecione...</option>
                                {motivosRefugo.map((m) => (
                                    <option key={m.id} value={m.id}>{m.codigo} - {m.descricao}</option>
                                ))}
                            </Select>
                        </div>
                        <button
                            onClick={() => setIsNewMotivoOpen(true)}
                            className={`flex items-center justify-center px-3 py-2 border rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${qtdRefugo <= 0 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'border-blue-600 text-blue-600 bg-white hover:bg-blue-50 focus:ring-blue-500'}`}
                            type="button"
                            title="Cadastrar Novo Motivo"
                            disabled={qtdRefugo <= 0}
                        >
                            <Plus size={16} className="mr-1" />
                            Novo
                        </button>
                    </div>
                </div>

                <NovoMotivoModal
                    isOpen={isNewMotivoOpen}
                    onClose={() => setIsNewMotivoOpen(false)}
                    onSuccess={loadMotivos}
                />

                <div>
                    <label className="block text-sm font-medium text-gray-700">Observações</label>
                    <Input
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        className="mt-1"
                        placeholder="Opcional"
                    />
                </div>

                <div className="flex items-center justify-between pt-4 border-t flex-wrap gap-2">
                    <label className="inline-flex items-center text-sm text-gray-700 font-medium">
                        <input
                            type="checkbox"
                            className="mr-2"
                            checked={finalizar}
                            onChange={(e) => setFinalizar(e.target.checked)}
                        />
                        Concluir operação após salvar
                    </label>
                    <Button variant="ghost" onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {loading ? 'Salvando...' : 'Confirmar Apontamento'}
                    </Button>
                </div>

                <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-gray-800">Apontamentos realizados</h3>
                        {saldoRestante < 0 && (
                            <div className="flex items-center text-sm text-yellow-700">
                                <AlertTriangle size={16} className="mr-1" />
                                Quantidade excedeu o planejado.
                            </div>
                        )}
                    </div>
                    <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full text-sm table-fixed">
                            <TableColGroup columns={apontamentosColumns} widths={apontamentosWidths} />
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                                <tr>
                                    <ResizableSortableTh
                                        columnId="data"
                                        label="Data"
                                        className="px-3 py-2 text-left"
                                        sort={apontamentosSort as any}
                                        onSort={(col) => setApontamentosSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startApontamentosResize}
                                    />
                                    <ResizableSortableTh
                                        columnId="boas"
                                        label="Boas"
                                        align="right"
                                        className="px-3 py-2"
                                        sort={apontamentosSort as any}
                                        onSort={(col) => setApontamentosSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startApontamentosResize}
                                    />
                                    <ResizableSortableTh
                                        columnId="refugo"
                                        label="Refugo"
                                        align="right"
                                        className="px-3 py-2"
                                        sort={apontamentosSort as any}
                                        onSort={(col) => setApontamentosSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startApontamentosResize}
                                    />
                                    <ResizableSortableTh
                                        columnId="motivo"
                                        label="Motivo"
                                        className="px-3 py-2 text-left"
                                        sort={apontamentosSort as any}
                                        onSort={(col) => setApontamentosSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startApontamentosResize}
                                    />
                                    <ResizableSortableTh
                                        columnId="obs"
                                        label="Obs"
                                        className="px-3 py-2 text-left"
                                        sort={apontamentosSort as any}
                                        onSort={(col) => setApontamentosSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startApontamentosResize}
                                    />
                                    <ResizableSortableTh
                                        columnId="acoes"
                                        label="Ações"
                                        align="center"
                                        className="px-3 py-2"
                                        sortable={false}
                                        resizable
                                        onResizeStart={startApontamentosResize}
                                    />
                                </tr>
                            </thead>
                            <tbody>
                                {apontamentosLoading && (
                                    <tr><td colSpan={6} className="text-center p-4 text-gray-500">Carregando...</td></tr>
                                )}
                                {!apontamentosLoading && apontamentos.length === 0 && (
                                    <tr><td colSpan={6} className="text-center p-4 text-gray-400">Nenhum apontamento registrado.</td></tr>
                                )}
                                {sortedApontamentos.map(item => (
                                    <tr key={item.id} className="border-t text-gray-700">
                                        <td className="px-3 py-2">{new Date(item.created_at).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right">{item.quantidade_boa || item.quantidade_produzida || 0}</td>
                                        <td className="px-3 py-2 text-right text-red-600">{item.quantidade_refugo || 0}</td>
                                        <td className="px-3 py-2">{item.motivo_refugo || '-'}</td>
                                        <td className="px-3 py-2">{item.observacoes || '-'}</td>
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                onClick={() => handleDeleteApontamento(item.id)}
                                                className="text-red-600 hover:text-red-800 inline-flex items-center gap-1 text-xs"
                                            >
                                                <Trash2 size={14} /> Excluir
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
