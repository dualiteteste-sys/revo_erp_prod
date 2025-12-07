import React, { useState, useEffect } from 'react';
import { Ruler, PlusCircle, Edit, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import UnidadeFormPanel from '@/components/cadastros/UnidadeFormPanel';
import { listUnidades, deleteUnidade, UnidadeMedida } from '@/services/unidades';
import { useToast } from '@/contexts/ToastProvider';

export default function UnidadesPage() {
    const [unidades, setUnidades] = useState<UnidadeMedida[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedUnidade, setSelectedUnidade] = useState<UnidadeMedida | null>(null);
    const { addToast } = useToast();

    const loadUnidades = async () => {
        setLoading(true);
        try {
            const data = await listUnidades();
            setUnidades(data);
        } catch (e) {
            console.error(e);
            addToast('Erro ao carregar unidades.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUnidades();
    }, []);

    const handleNew = () => {
        setSelectedUnidade(null);
        setIsFormOpen(true);
    };

    const handleEdit = (u: UnidadeMedida) => {
        setSelectedUnidade(u);
        setIsFormOpen(true);
    };

    const handleDelete = async (u: UnidadeMedida) => {
        if (u.empresa_id === null) {
            addToast('Não é possível excluir unidades padrão do sistema.', 'error');
            return;
        }
        if (!confirm(`Tem certeza que deseja excluir a unidade ${u.sigla}?`)) return;

        try {
            await deleteUnidade(u.id);
            addToast('Unidade excluída com sucesso!', 'success');
            loadUnidades();
        } catch (e) {
            console.error(e);
            addToast('Erro ao excluir unidade. Verifique se não está em uso.', 'error');
        }
    };

    const handleSaveSuccess = () => {
        setIsFormOpen(false);
        loadUnidades();
    };

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Ruler className="text-blue-600" /> Unidades de Medida
                    </h1>
                    <p className="text-gray-600 mt-1">Gerencie as unidades de medida disponíveis no sistema.</p>
                </div>
                <button
                    onClick={handleNew}
                    className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <PlusCircle size={20} />
                    Nova Unidade
                </button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden flex-grow">
                <div className="overflow-auto max-h-full">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sigla</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origem</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-gray-500">
                                        Carregando...
                                    </td>
                                </tr>
                            ) : unidades.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-gray-500">
                                        Nenhuma unidade encontrada.
                                    </td>
                                </tr>
                            ) : (
                                unidades.map((u) => (
                                    <tr key={u.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{u.sigla}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{u.descricao}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {u.empresa_id ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                                    Personalizada
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                    Padrão
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {u.ativo ? (
                                                <span className="text-green-600 font-medium">Ativo</span>
                                            ) : (
                                                <span className="text-gray-400">Inativo</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => handleEdit(u)}
                                                className="text-blue-600 hover:text-blue-900 mr-4"
                                                title="Editar"
                                            >
                                                <Edit size={18} />
                                            </button>
                                            {u.empresa_id !== null && (
                                                <button
                                                    onClick={() => handleDelete(u)}
                                                    className="text-red-600 hover:text-red-900"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={selectedUnidade ? 'Editar Unidade' : 'Nova Unidade'}>
                <UnidadeFormPanel
                    data={selectedUnidade}
                    onSaveSuccess={handleSaveSuccess}
                    onClose={() => setIsFormOpen(false)}
                />
            </Modal>
        </div>
    );
}
