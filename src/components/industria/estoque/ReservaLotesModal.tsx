import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getLotesDisponiveis, reservarEstoque, EstoqueLote } from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import ResizableSortableTh from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

interface ReservaLotesModalProps {
    isOpen: boolean;
    onClose: () => void;
    ordemId: string;
    componenteId: string;
    produtoId: string;
    produtoNome: string;
    quantidadeNecessaria: number; // Planejada - Reservada
    onSuccess: () => void;
}

const ReservaLotesModal: React.FC<ReservaLotesModalProps> = ({
    isOpen,
    onClose,
    ordemId,
    componenteId,
    produtoId,
    produtoNome,
    quantidadeNecessaria,
    onSuccess
}) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [lotes, setLotes] = useState<EstoqueLote[]>([]);
    const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
    const columns: TableColumnWidthDef[] = [
        { id: 'lote', defaultWidth: 220, minWidth: 180 },
        { id: 'validade', defaultWidth: 180, minWidth: 150 },
        { id: 'disponivel', defaultWidth: 160, minWidth: 140 },
        { id: 'reservar', defaultWidth: 200, minWidth: 160 },
    ];
    const { widths, startResize } = useTableColumnWidths({ tableId: `industria:reserva-lotes:${produtoId}`, columns });

    useEffect(() => {
        if (isOpen && produtoId) {
            loadLotes();
            setSelectedQuantities({});
        }
    }, [isOpen, produtoId]);

    const loadLotes = async () => {
        try {
            setLoading(true);
            const data = await getLotesDisponiveis(produtoId);
            setLotes(data);
        } catch (error) {
            logger.error('[Indústria][Estoque] Falha ao carregar lotes disponíveis', error, { produtoId });
            addToast('Erro ao carregar lotes disponíveis.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleQuantityChange = (lote: string, value: string, max: number) => {
        const num = parseFloat(value);
        if (isNaN(num)) {
            const newQty = { ...selectedQuantities };
            delete newQty[lote];
            setSelectedQuantities(newQty);
            return;
        }

        // Don't allow reserving more than available in the lot
        if (num > max) {
            addToast(`Quantidade máxima para este lote é ${max}`, 'error');
            return;
        }

        setSelectedQuantities(prev => ({
            ...prev,
            [lote]: num
        }));
    };

    const handleAutoDistribute = () => {
        let remaining = quantidadeNecessaria;
        const distribution: Record<string, number> = {};

        // Sort by expiration (FIFO) - already sorted by backend usually, but let's ensure
        const sortedLotes = [...lotes].sort((a, b) => {
            if (!a.validade) return 1;
            if (!b.validade) return -1;
            return new Date(a.validade).getTime() - new Date(b.validade).getTime();
        });

        for (const lote of sortedLotes) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, lote.disponivel);
            distribution[lote.lote] = take;
            remaining -= take;
        }
        setSelectedQuantities(distribution);
    };

    const handleSubmit = async () => {
        try {
            setSubmitting(true);
            const promises = Object.entries(selectedQuantities).map(([lote, qtd]) =>
                reservarEstoque({
                    ordem_id: ordemId,
                    componente_id: componenteId,
                    lote: lote,
                    quantidade: qtd
                })
            );

            await Promise.all(promises);
            addToast('Reservas realizadas com sucesso!', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            logger.error('[Indústria][Estoque] Falha ao reservar lotes', error, { ordemId, componenteId, produtoId });
            addToast('Erro ao realizar reservas: ' + (error.message || 'Erro desconhecido'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const totalSelected = Object.values(selectedQuantities).reduce((acc, curr) => acc + curr, 0);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Reservar Lotes - {produtoNome}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-blue-50 p-3 rounded-md">
                        <div>
                            <p className="text-sm text-blue-700 font-medium">Necessário a Reservar</p>
                            <p className="text-2xl font-bold text-blue-900">{quantidadeNecessaria.toFixed(4)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-green-700 font-medium text-right">Selecionado</p>
                            <p className={`text-2xl font-bold text-right ${totalSelected > quantidadeNecessaria ? 'text-orange-600' : 'text-green-900'}`}>{totalSelected.toFixed(4)}</p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={handleAutoDistribute} disabled={loading || lotes.length === 0}>
                            Distribuir Automaticamente (FIFO)
                        </Button>
                    </div>

                    <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                        {loading ? (
                            <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
                        ) : lotes.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">Nenhum lote disponível para este produto.</div>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200 table-fixed">
                                <TableColGroup columns={columns} widths={widths} />
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <ResizableSortableTh columnId="lote" label="Lote" sortable={false} onResizeStart={startResize} className="px-3 py-2" />
                                        <ResizableSortableTh columnId="validade" label="Validade" sortable={false} onResizeStart={startResize} className="px-3 py-2" />
                                        <ResizableSortableTh columnId="disponivel" label="Disponível" sortable={false} onResizeStart={startResize} align="right" className="px-3 py-2" />
                                        <ResizableSortableTh columnId="reservar" label="Reservar" sortable={false} onResizeStart={startResize} align="right" className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {lotes.map(lote => (
                                        <tr key={lote.lote} className={selectedQuantities[lote.lote] ? 'bg-blue-50' : ''}>
                                            <td className="px-3 py-2 text-sm font-medium text-gray-900">{lote.lote}</td>
                                            <td className="px-3 py-2 text-sm text-gray-500">
                                                {lote.validade ? new Date(lote.validade).toLocaleDateString() : '-'}
                                                {lote.validade && new Date(lote.validade) < new Date() && <span className="ml-2 text-xs text-red-500 font-bold">(Vencido)</span>}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-right text-gray-900">{lote.disponivel.toFixed(4)}</td>
                                            <td className="px-3 py-2 text-right w-40">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={lote.disponivel}
                                                    step="0.0001"
                                                    className="w-full p-1 border rounded text-right text-sm"
                                                    value={selectedQuantities[lote.lote] || ''}
                                                    onChange={(e) => handleQuantityChange(lote.lote, e.target.value, lote.disponivel)}
                                                    placeholder="0.0000"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={submitting || totalSelected === 0}>
                        {submitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                        Confirmar Reserva
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ReservaLotesModal;
