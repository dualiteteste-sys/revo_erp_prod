import React, { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import TextArea from '@/components/ui/forms/TextArea';
import DecimalInput from '@/components/ui/forms/DecimalInput';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';
import {
    OrdemOperacao,
    QualidadeMotivo,
    StatusInspecaoQA,
    getMotivosRefugo,
    registrarInspecao
} from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthProvider';

interface Props {
    operacao: OrdemOperacao | null;
    tipo: 'IP' | 'IF' | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface FormState {
    quantidade_inspecionada: number;
    quantidade_aprovada: number;
    quantidade_rejeitada: number;
    resultado: StatusInspecaoQA;
    motivo_refugo_id: string;
    observacoes: string;
}

const statusLabels: Record<StatusInspecaoQA, string> = {
    aprovada: 'Aprovada',
    em_analise: 'Em análise',
    reprovada: 'Reprovada'
};

export default function RegistrarInspecaoModal({ operacao, tipo, isOpen, onClose, onSuccess }: Props) {
    const { addToast } = useToast();
    const { loading: authLoading, activeEmpresaId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [motivos, setMotivos] = useState<QualidadeMotivo[]>([]);
    const actionTokenRef = useRef(0);
    const empresaRef = useRef<string | null>(activeEmpresaId);
    const [form, setForm] = useState<FormState>({
        quantidade_inspecionada: 0,
        quantidade_aprovada: 0,
        quantidade_rejeitada: 0,
        resultado: 'aprovada',
        motivo_refugo_id: '',
        observacoes: ''
    });

    useEffect(() => {
        empresaRef.current = activeEmpresaId;
    }, [activeEmpresaId]);

    useEffect(() => {
        if (!isOpen || !operacao) return;
        if (authLoading || !activeEmpresaId) return;
        const token = ++actionTokenRef.current;
        const empresaSnapshot = activeEmpresaId;
        const defaultQty = Math.max(
            operacao.quantidade_transferida ?? (operacao as any).quantidade_produzida ?? 0,
            0
        );
        setForm({
            quantidade_inspecionada: defaultQty,
            quantidade_aprovada: defaultQty,
            quantidade_rejeitada: 0,
            resultado: 'aprovada',
            motivo_refugo_id: '',
            observacoes: ''
        });
        getMotivosRefugo()
          .then((rows) => {
            if (token !== actionTokenRef.current || empresaSnapshot !== empresaRef.current) return;
            setMotivos(rows);
          })
          .catch((e: any) => {
            if (token !== actionTokenRef.current || empresaSnapshot !== empresaRef.current) return;
            logger.error('[Indústria][QA] Falha ao carregar motivos de refugo', e, { operacaoId: operacao.id });
            addToast(e?.message || 'Erro ao carregar motivos de refugo.', 'error');
          });
    }, [isOpen, operacao, authLoading, activeEmpresaId, addToast]);

    const handleChange = (field: keyof FormState, value: any) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async () => {
        if (!operacao || !tipo) return;
        if (loading) return;
        if (authLoading || !activeEmpresaId) {
            addToast('Aguarde a troca de contexto (login/empresa) concluir para registrar inspeção.', 'info');
            return;
        }

        if (form.quantidade_inspecionada <= 0) {
            addToast('Informe a quantidade inspecionada.', 'error');
            return;
        }
        if (form.resultado === 'reprovada') {
            if (form.quantidade_rejeitada <= 0) {
                addToast('Informe a quantidade rejeitada para uma reprovação.', 'error');
                return;
            }
            if (!form.motivo_refugo_id) {
                addToast('Selecione um motivo de refugo.', 'error');
                return;
            }
        }

        setLoading(true);
        const token = ++actionTokenRef.current;
        const empresaSnapshot = activeEmpresaId;
        try {
            await registrarInspecao({
                ordem_id: operacao.ordem_id,
                operacao_id: operacao.id,
                tipo,
                resultado: form.resultado,
                quantidade_inspecionada: form.quantidade_inspecionada,
                quantidade_aprovada: form.quantidade_aprovada,
                quantidade_rejeitada: form.quantidade_rejeitada,
                motivo_refugo_id: form.motivo_refugo_id || undefined,
                observacoes: form.observacoes
            });
            if (token !== actionTokenRef.current || empresaSnapshot !== empresaRef.current) return;
            addToast(`Inspeção ${statusLabels[form.resultado]} registrada.`, 'success');
            onSuccess();
            onClose();
        } catch (e: any) {
            if (token !== actionTokenRef.current || empresaSnapshot !== empresaRef.current) return;
            addToast(e.message, 'error');
        } finally {
            if (token !== actionTokenRef.current || empresaSnapshot !== empresaRef.current) return;
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Registrar ${tipo === 'IF' ? 'Inspeção Final' : 'Inspeção em Processo'}`}
            size="lg"
        >
            <div className="p-6 space-y-5">
                {operacao && (
                    <div className="bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded text-sm">
                        <div className="font-semibold mb-1">Operação {operacao.sequencia} · {operacao.centro_trabalho_nome}</div>
                        <div className="flex flex-wrap gap-4">
                            <span><strong>Planejado:</strong> {operacao.quantidade_planejada}</span>
                            <span><strong>Produzido:</strong> {Number((operacao as any).quantidade_produzida ?? 0)}</span>
                            <span><strong>Transferido:</strong> {operacao.quantidade_transferida ?? 0}</span>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Qtd. Inspecionada</label>
                        <DecimalInput
                            value={form.quantidade_inspecionada}
                            onChange={(value) => handleChange('quantidade_inspecionada', value)}
                            precision={2}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Qtd. Aprovada</label>
                        <DecimalInput
                            value={form.quantidade_aprovada}
                            onChange={(value) => handleChange('quantidade_aprovada', value)}
                            precision={2}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Qtd. Rejeitada</label>
                        <DecimalInput
                            value={form.quantidade_rejeitada}
                            onChange={(value) => handleChange('quantidade_rejeitada', value)}
                            precision={2}
                            className="mt-1"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                        label="Resultado"
                        value={form.resultado}
                        onChange={(e) => handleChange('resultado', e.target.value as StatusInspecaoQA)}
                    >
                        <option value="aprovada">Aprovada</option>
                        <option value="em_analise">Em análise</option>
                        <option value="reprovada">Reprovada</option>
                    </Select>

                    <Select
                        label="Motivo (refugo/bloqueio)"
                        value={form.motivo_refugo_id}
                        onChange={(e) => handleChange('motivo_refugo_id', e.target.value)}
                        disabled={form.resultado === 'aprovada'}
                    >
                        <option value="">Selecione...</option>
                        {motivos.map((motivo) => (
                            <option key={motivo.id} value={motivo.id}>
                                {motivo.codigo} - {motivo.descricao}
                            </option>
                        ))}
                    </Select>
                </div>

                <TextArea
                    label="Observações"
                    value={form.observacoes}
                    onChange={(e) => handleChange('observacoes', e.target.value)}
                    placeholder={tipo === 'IF'
                        ? 'Ex.: Lote aprovado, liberar etiqueta / Liberação para entrega.'
                        : 'Ex.: Lote parcial liberado após inspeção de processo.'}
                />

                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="ghost" onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading || authLoading || !activeEmpresaId}>
                        {loading ? 'Registrando...' : 'Salvar Inspeção'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
