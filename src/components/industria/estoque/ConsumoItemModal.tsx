import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getLotesDisponiveis, consumirEstoque, EstoqueLote } from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthProvider';

interface ConsumoItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    ordemId: string;
    componenteId: string;
    produtoId: string;
    produtoNome: string;
    onSuccess: () => void;
}

const ConsumoItemModal: React.FC<ConsumoItemModalProps> = ({
    isOpen,
    onClose,
    ordemId,
    componenteId,
    produtoId,
    produtoNome,
    onSuccess
}) => {
    const { addToast } = useToast();
    const { loading: authLoading, activeEmpresaId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [lotes, setLotes] = useState<EstoqueLote[]>([]);

    const [selectedLote, setSelectedLote] = useState<string>('');
    const [quantidade, setQuantidade] = useState<string>('');
    const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
    const actionTokenRef = useRef(0);

    useEffect(() => {
        const prevEmpresaId = lastEmpresaIdRef.current;
        if (prevEmpresaId === activeEmpresaId) return;
        actionTokenRef.current += 1;
        setLoading(false);
        setSubmitting(false);
        setLotes([]);
        setSelectedLote('');
        setQuantidade('');
        lastEmpresaIdRef.current = activeEmpresaId;
    }, [activeEmpresaId]);

    useEffect(() => {
        if (isOpen && produtoId) {
            loadLotes();
            setSelectedLote('');
            setQuantidade('');
        }
    }, [isOpen, produtoId, authLoading, activeEmpresaId]);

    const loadLotes = async () => {
        if (authLoading || !activeEmpresaId) return;
        const token = ++actionTokenRef.current;
        const empresaSnapshot = activeEmpresaId;
        try {
            setLoading(true);
            const data = await getLotesDisponiveis(produtoId);
            if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
            setLotes(data);
        } catch (error) {
            if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
            addToast('Erro ao carregar lotes.', 'error');
        } finally {
            if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (submitting) return;
        if (authLoading || !activeEmpresaId) {
            addToast('Aguarde a troca de contexto (login/empresa) concluir para consumir.', 'info');
            return;
        }
        if (!selectedLote || !quantidade) return;
        const token = ++actionTokenRef.current;
        const empresaSnapshot = activeEmpresaId;

        try {
            setSubmitting(true);
            await consumirEstoque({
                ordem_id: ordemId,
                componente_id: componenteId,
                lote: selectedLote,
                quantidade: parseFloat(quantidade)
            });

            if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
            addToast('Consumo realizado!', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
            logger.error('[Indústria][Estoque] Falha ao consumir lote', error, { ordemId, componenteId, produtoId, lote: selectedLote });
            addToast('Erro ao consumir: ' + (error.message || 'Erro desconhecido'), 'error');
        } finally {
            if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
            setSubmitting(false);
        }
    };

    const currentLoteData = lotes.find(l => l.lote === selectedLote);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Consumir Item - {produtoNome}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Lote</label>
                        <select
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                            value={selectedLote}
                            onChange={(e) => setSelectedLote(e.target.value)}
                            disabled={loading}
                        >
                            <option value="">Selecione um lote...</option>
                            {lotes.map(l => (
                                <option key={l.lote} value={l.lote}>
                                    {l.lote} (Saldo: {l.saldo} / Reservado: {l.reservado})
                                </option>
                            ))}
                        </select>
                    </div>

                    {currentLoteData && (
                        <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                            <p>Validade: {currentLoteData.validade ? new Date(currentLoteData.validade).toLocaleDateString() : 'N/A'}</p>
                            <p>Disponível para Consumo: <strong>{currentLoteData.saldo}</strong></p>
                            {currentLoteData.reservado > 0 && <p className="text-blue-600">Este lote possui {currentLoteData.reservado} unidades reservadas.</p>}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Quantidade a Consumir</label>
                        <input
                            type="number"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                            value={quantidade}
                            onChange={e => setQuantidade(e.target.value)}
                            placeholder="0.0000"
                            max={currentLoteData?.saldo}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={submitting || authLoading || !activeEmpresaId || !selectedLote || !quantidade}>
                        {submitting && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                        Confirmar Consumo
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ConsumoItemModal;
