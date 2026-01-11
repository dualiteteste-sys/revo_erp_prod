import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import {
    OrdemOperacao,
    RegistroInspecao,
    StatusInspecaoQA,
    listarInspecoes,
    setOperacaoQARequirements
} from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import { ShieldCheck, AlertTriangle, ClipboardCheck } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

interface Props {
    operacao: OrdemOperacao | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdated: () => void;
    onRequestInspection: (tipo: 'IP' | 'IF') => void;
    refreshToken: number;
}

const statusClasses: Record<StatusInspecaoQA, string> = {
    aprovada: 'bg-green-100 text-green-800',
    em_analise: 'bg-yellow-100 text-yellow-800',
    reprovada: 'bg-red-100 text-red-700'
};

const statusLabel: Record<StatusInspecaoQA, string> = {
    aprovada: 'Aprovada',
    em_analise: 'Em análise',
    reprovada: 'Reprovada'
};

export default function OperacaoQaModal({ operacao, isOpen, onClose, onUpdated, onRequestInspection, refreshToken }: Props) {
    const { addToast } = useToast();
    const [requireIp, setRequireIp] = useState(false);
    const [requireIf, setRequireIf] = useState(false);
    const [inspecoes, setInspecoes] = useState<RegistroInspecao[]>([]);
    const [loadingInspecoes, setLoadingInspecoes] = useState(false);
    const [inspecoesSort, setInspecoesSort] = useState<SortState<string>>({ column: 'data', direction: 'desc' });

    const inspecoesColumns: TableColumnWidthDef[] = [
        { id: 'tipo', defaultWidth: 120, minWidth: 100 },
        { id: 'resultado', defaultWidth: 160, minWidth: 140 },
        { id: 'qtd_insp', defaultWidth: 140, minWidth: 120 },
        { id: 'qtd_rej', defaultWidth: 140, minWidth: 120 },
        { id: 'data', defaultWidth: 220, minWidth: 200 },
        { id: 'obs', defaultWidth: 420, minWidth: 160 },
    ];
    const { widths: inspecoesWidths, startResize: startInspecoesResize } = useTableColumnWidths({
        tableId: 'industria:producao:inspecoes',
        columns: inspecoesColumns,
    });
    const sortedInspecoes = useMemo(() => {
        return sortRows(
            inspecoes,
            inspecoesSort as any,
            [
                { id: 'tipo', type: 'string', getValue: (r) => r.tipo ?? '' },
                { id: 'resultado', type: 'string', getValue: (r) => r.resultado ?? '' },
                { id: 'qtd_insp', type: 'number', getValue: (r) => r.quantidade_inspecionada ?? 0 },
                { id: 'qtd_rej', type: 'number', getValue: (r) => r.quantidade_rejeitada ?? 0 },
                { id: 'data', type: 'date', getValue: (r) => r.created_at },
                { id: 'obs', type: 'string', getValue: (r) => r.observacoes ?? '' },
            ] as const
        );
    }, [inspecoes, inspecoesSort]);

    useEffect(() => {
        if (operacao && isOpen) {
            setRequireIp(!!operacao.require_ip);
            setRequireIf(!!operacao.require_if);
            loadInspecoes(operacao.id);
        }
    }, [operacao, isOpen]);

    useEffect(() => {
        if (operacao && isOpen) {
            loadInspecoes(operacao.id);
        }
    }, [refreshToken, operacao, isOpen]);

    const loadInspecoes = async (operacaoId: string) => {
        setLoadingInspecoes(true);
        try {
            const data = await listarInspecoes(operacaoId);
            setInspecoes(data);
        } catch (e: any) {
            addToast(e.message, 'error');
        } finally {
            setLoadingInspecoes(false);
        }
    };

    const handleToggle = async (field: 'IP' | 'IF', value: boolean) => {
        if (!operacao) return;
        try {
            await setOperacaoQARequirements(
                operacao.id,
                field === 'IP' ? value : requireIp,
                field === 'IF' ? value : requireIf
            );
            addToast('Requisito atualizado.', 'success');
            setRequireIp(field === 'IP' ? value : requireIp);
            setRequireIf(field === 'IF' ? value : requireIf);
            onUpdated();
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    const renderStatus = (label: string, required: boolean, status?: StatusInspecaoQA | null, lastDate?: string | null) => {
        if (!required) {
            return <span className="text-xs text-gray-500">Não exigido</span>;
        }
        if (!status) {
            return (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-800">
                    <AlertTriangle className="w-3 h-3" />
                    {label} pendente
                </span>
            );
        }
        return (
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${statusClasses[status]}`}>
                <ShieldCheck className="w-3 h-3" />
                {label} {statusLabel[status]}
                {lastDate && <span className="text-[10px] opacity-80">({new Date(lastDate).toLocaleString()})</span>}
            </span>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Qualidade · Requisitos e Inspeções"
            size="xl"
        >
            <div className="p-6 space-y-6">
                {operacao && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm space-y-1">
                        <div className="font-semibold text-slate-700">
                            Operação {operacao.sequencia} · {operacao.centro_trabalho_nome}
                        </div>
                        <div className="text-slate-500">
                            Defina se esta etapa exige inspeção e registre IP/IF para liberar a produção seguinte.
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-gray-800">Inspeção em Processo</div>
                                <p className="text-xs text-gray-500">Bloqueia a próxima etapa até que o lote parcial seja liberado.</p>
                            </div>
                            <label className="inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={requireIp}
                                    onChange={(e) => handleToggle('IP', e.target.checked)}
                                />
                                <span className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-500 transition-all relative">
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transform transition ${requireIp ? 'translate-x-5' : ''}`} />
                                </span>
                            </label>
                        </div>
                        {operacao && renderStatus('IP', requireIp, operacao.ip_status, operacao.ip_last_inspecao)}
                        {requireIp && (
                            <Button size="sm" className="mt-2" onClick={() => onRequestInspection('IP')}>
                                <ClipboardCheck className="w-4 h-4 mr-2" />
                                Registrar IP
                            </Button>
                        )}
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-gray-800">Inspeção Final</div>
                                <p className="text-xs text-gray-500">Obrigatória para fechar a OP quando ativada.</p>
                            </div>
                            <label className="inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={requireIf}
                                    onChange={(e) => handleToggle('IF', e.target.checked)}
                                />
                                <span className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-500 transition-all relative">
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transform transition ${requireIf ? 'translate-x-5' : ''}`} />
                                </span>
                            </label>
                        </div>
                        {operacao && renderStatus('IF', requireIf, operacao.if_status, operacao.if_last_inspecao)}
                        {requireIf && (
                            <Button size="sm" className="mt-2" onClick={() => onRequestInspection('IF')}>
                                <ClipboardCheck className="w-4 h-4 mr-2" />
                                Registrar IF
                            </Button>
                        )}
                    </div>
                </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-semibold text-gray-800">Histórico de inspeções</h3>
                                <span className="text-xs text-gray-500">{inspecoes.length} registro(s)</span>
                            </div>
                            <div className="border rounded-lg max-h-64 overflow-y-auto">
                                <table className="min-w-full text-sm table-fixed">
                                    <TableColGroup columns={inspecoesColumns} widths={inspecoesWidths} />
                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                                        <tr>
                                            <ResizableSortableTh
                                                columnId="tipo"
                                                label="Tipo"
                                                className="px-3 py-2 text-left"
                                                sort={inspecoesSort as any}
                                                onSort={(col) => setInspecoesSort((prev) => toggleSort(prev as any, col))}
                                                onResizeStart={startInspecoesResize}
                                            />
                                            <ResizableSortableTh
                                                columnId="resultado"
                                                label="Resultado"
                                                className="px-3 py-2 text-left"
                                                sort={inspecoesSort as any}
                                                onSort={(col) => setInspecoesSort((prev) => toggleSort(prev as any, col))}
                                                onResizeStart={startInspecoesResize}
                                            />
                                            <ResizableSortableTh
                                                columnId="qtd_insp"
                                                label="Qtd. Insp."
                                                align="right"
                                                className="px-3 py-2"
                                                sort={inspecoesSort as any}
                                                onSort={(col) => setInspecoesSort((prev) => toggleSort(prev as any, col))}
                                                onResizeStart={startInspecoesResize}
                                            />
                                            <ResizableSortableTh
                                                columnId="qtd_rej"
                                                label="Qtd. Rej."
                                                align="right"
                                                className="px-3 py-2"
                                                sort={inspecoesSort as any}
                                                onSort={(col) => setInspecoesSort((prev) => toggleSort(prev as any, col))}
                                                onResizeStart={startInspecoesResize}
                                            />
                                            <ResizableSortableTh
                                                columnId="data"
                                                label="Data"
                                                className="px-3 py-2 text-left"
                                                sort={inspecoesSort as any}
                                                onSort={(col) => setInspecoesSort((prev) => toggleSort(prev as any, col))}
                                                onResizeStart={startInspecoesResize}
                                            />
                                            <ResizableSortableTh
                                                columnId="obs"
                                                label="Obs."
                                                className="px-3 py-2 text-left"
                                                sort={inspecoesSort as any}
                                                onSort={(col) => setInspecoesSort((prev) => toggleSort(prev as any, col))}
                                                onResizeStart={startInspecoesResize}
                                            />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingInspecoes && (
                                            <tr>
                                                <td colSpan={6} className="text-center py-6 text-gray-500 text-sm">Carregando...</td>
                                            </tr>
                                        )}
                                        {!loadingInspecoes && inspecoes.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="text-center py-6 text-gray-400 text-sm">
                                                    Nenhuma inspeção registrada ainda.
                                                </td>
                                            </tr>
                                        )}
                                        {sortedInspecoes.map((item) => (
                                            <tr key={item.id} className="border-t">
                                                <td className="px-3 py-2 font-medium">{item.tipo}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs ${statusClasses[item.resultado]}`}>
                                                        {statusLabel[item.resultado]}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right">{item.quantidade_inspecionada}</td>
                                                <td className="px-3 py-2 text-right text-red-600">{item.quantidade_rejeitada}</td>
                                                <td className="px-3 py-2">{new Date(item.created_at).toLocaleString()}</td>
                                                <td className="px-3 py-2">{item.observacoes || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                <div className="flex justify-end pt-4 border-t">
                    <Button variant="ghost" onClick={onClose}>Fechar</Button>
                </div>
            </div>
        </Modal>
    );
}
