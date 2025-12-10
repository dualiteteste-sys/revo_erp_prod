import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import { Button } from '../../ui/button';
import Input from '../../ui/forms/Input';
import Select from '../../ui/forms/Select';
import { OrdemOperacao, apontarProducao, getMotivosRefugo, QualidadeMotivo } from '../../../services/industriaProducao';
import { useToast } from '../../../contexts/ToastProvider';
import DecimalInput from '../../ui/forms/DecimalInput';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    operacao: OrdemOperacao;
    onSuccess: () => void;
}

export default function ApontamentoModal({ isOpen, onClose, operacao, onSuccess }: Props) {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);

    const [qtdBoa, setQtdBoa] = useState(0);
    const [qtdRefugo, setQtdRefugo] = useState(0);
    const [motivoRefugoId, setMotivoRefugoId] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [finalizar, setFinalizar] = useState(false); // Add Finalize Checkbox support if needed, or default false

    const [motivosRefugo, setMotivosRefugo] = useState<QualidadeMotivo[]>([]);

    useEffect(() => {
        if (isOpen) {
            getMotivosRefugo()
                .then(setMotivosRefugo)
                .catch(err => console.error('Erro ao carregar motivos:', err));
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
            onClose();
        } catch (e: any) {
            addToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Apontar Produção - Seq ${operacao.sequencia} ${operacao.centro_trabalho_nome || ''}`}
            size="md"
        >
            <div className="space-y-4">

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

                {qtdRefugo > 0 && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Motivo do Refugo</label>
                        <Select
                            value={motivoRefugoId}
                            onChange={(e) => setMotivoRefugoId(e.target.value)}
                            className="mt-1"
                        >
                            <option value="">Selecione...</option>
                            {motivosRefugo.map((m) => (
                                <option key={m.id} value={m.id}>{m.codigo} - {m.descricao}</option>
                            ))}
                        </Select>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700">Observações</label>
                    <Input
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        className="mt-1"
                        placeholder="Opcional"
                    />
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                    <Button variant="ghost" onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? 'Salvando...' : 'Confirmar Apontamento'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
