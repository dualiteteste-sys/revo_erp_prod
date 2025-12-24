import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, ClipboardCheck, Loader2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { callRpc } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { QualidadeMotivo } from '@/services/industriaProducao';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';

export default function MotivosRefugoPage() {
    const [motivos, setMotivos] = useState<QualidadeMotivo[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    // Form State
    const [formData, setFormData] = useState({
        codigo: '',
        descricao: '',
        tipo: 'refugo'
    });

    const fetchMotivos = async () => {
        setLoading(true);
        try {
            const data = await callRpc<QualidadeMotivo[]>('qualidade_get_motivos');
            setMotivos(data || []);
        } catch (e: any) {
            addToast('Erro ao carregar motivos: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMotivos();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await callRpc('qualidade_adicionar_motivo', {
                p_codigo: formData.codigo,
                p_descricao: formData.descricao,
                p_tipo: formData.tipo
            });

            addToast('Motivo adicionado com sucesso!', 'success');
            setIsModalOpen(false);
            setFormData({ codigo: '', descricao: '', tipo: 'refugo' });
            fetchMotivos();
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir motivo',
            description: 'Excluir este motivo? Esta ação não pode ser desfeita.',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await callRpc('qualidade_excluir_motivo', { p_id: id });
            addToast('Motivo excluído.', 'success');
            fetchMotivos();
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    return (
        <div className="p-1 space-y-6">
            <PageHeader
              title="Motivos de Qualidade"
              description="Gerencie os motivos de refugo, bloqueio e devolução."
              icon={<ClipboardCheck className="w-5 h-5" />}
              actions={
                <Button onClick={() => setIsModalOpen(true)} className="gap-2">
                  <Plus size={18} />
                  Novo Motivo
                </Button>
              }
            />

            <div className="bg-white rounded shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Código</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Descrição</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {loading && (
                            <tr>
                                <td colSpan={4} className="py-10 text-center text-gray-500">
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="animate-spin" size={18} /> Carregando...
                                    </span>
                                </td>
                            </tr>
                        )}
                        {motivos.map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 font-mono text-sm text-gray-700 font-medium">{m.codigo}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{m.descricao}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                        ${m.tipo === 'refugo' ? 'bg-red-100 text-red-800' :
                                            m.tipo === 'bloqueio' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {m.tipo || 'refugo'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => handleDelete(m.id)}
                                        className="text-gray-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
                                        title="Excluir"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {motivos.length === 0 && !loading && (
                            <tr>
                                <td colSpan={4} className="py-12">
                                    <div className="text-center text-gray-500 flex flex-col items-center justify-center gap-2">
                                        <Trash2 size={44} className="opacity-20 mb-1" />
                                        <p className="font-semibold text-gray-700">Nenhum motivo cadastrado.</p>
                                        <p className="text-sm text-gray-500">Clique em “Novo Motivo” para começar.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Novo Motivo">
                <form onSubmit={handleSubmit} className="space-y-6 p-6">
                    <Input
                        label="Código"
                        value={formData.codigo}
                        onChange={e => setFormData({ ...formData, codigo: e.target.value })}
                        placeholder="Ex: DIM-01"
                        required
                    />
                    <Input
                        label="Descrição"
                        value={formData.descricao}
                        onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                        placeholder="Ex: Dimensão fora da tolerância"
                        required
                    />
                    <Select
                        label="Tipo"
                        value={formData.tipo}
                        onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                    >
                        <option value="refugo">Refugo</option>
                        <option value="bloqueio">Bloqueio</option>
                        <option value="devolucao">Devolução</option>
                    </Select>
                    <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="gap-2">
                            <Save size={18} /> Salvar
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
