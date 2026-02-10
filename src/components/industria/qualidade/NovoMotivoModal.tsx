import React, { useState } from 'react';
import { useToast } from '@/contexts/ToastProvider';
import { callRpc } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { useAuth } from '@/contexts/AuthProvider';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function NovoMotivoModal({ isOpen, onClose, onSuccess }: Props) {
    const { addToast } = useToast();
    const { loading: authLoading, activeEmpresaId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        codigo: '',
        descricao: '',
        tipo: 'refugo'
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (authLoading || !activeEmpresaId) {
            addToast('Aguarde a troca de contexto (login/empresa) concluir para salvar.', 'info');
            return;
        }
        if (!formData.codigo || !formData.descricao) {
            addToast('Preencha código e descrição.', 'error');
            return;
        }

        setLoading(true);
        try {
            await callRpc('qualidade_adicionar_motivo', {
                p_codigo: formData.codigo,
                p_descricao: formData.descricao,
                p_tipo: formData.tipo
            });

            addToast('Motivo adicionado com sucesso!', 'success');
            setFormData({ codigo: '', descricao: '', tipo: 'refugo' });
            onSuccess();
            onClose();
        } catch (e: any) {
            addToast('Erro ao salvar motivo: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Novo Motivo de Qualidade"
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Código</label>
                    <Input
                        value={formData.codigo}
                        onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                        placeholder="Ex: REF-001"
                        className="mt-1"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Descrição</label>
                    <Input
                        value={formData.descricao}
                        onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                        placeholder="Ex: Defeito na matéria-prima"
                        className="mt-1"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Tipo</label>
                    <Select
                        value={formData.tipo}
                        onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                        className="mt-1"
                    >
                        <option value="refugo">Refugo</option>
                        <option value="bloqueio">Bloqueio</option>
                        <option value="devolucao">Devolução</option>
                    </Select>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t mt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading || authLoading || !activeEmpresaId}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={loading || authLoading || !activeEmpresaId}
                        className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        {loading ? 'Salvando...' : 'Salvar Motivo'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
