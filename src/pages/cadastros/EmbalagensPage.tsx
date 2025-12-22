import React, { useEffect, useState } from 'react';
import { Plus, Search, Package, Edit2, Trash2, Box, FileText, Circle } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import Input from '../../components/ui/forms/Input';
import { Button } from '../../components/ui/button';
import { Embalagem, listEmbalagens, deleteEmbalagem } from '../../services/embalagens';
import EmbalagemFormPanel from '../../components/cadastros/EmbalagemFormPanel';
import { useToast } from '../../contexts/ToastProvider';
import { tipo_embalagem } from '../../types/database.types';
import { useConfirm } from '@/contexts/ConfirmProvider';

const EmbalagensPage: React.FC = () => {
    const [embalagens, setEmbalagens] = useState<Embalagem[]>([]);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedEmbalagem, setSelectedEmbalagem] = useState<Embalagem | null>(null);
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const fetchEmbalagens = async () => {
        setIsLoading(true);
        try {
            const data = await listEmbalagens(search);
            setEmbalagens(data);
        } catch (error) {
            console.error(error);
            addToast('Erro ao carregar embalagens.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchEmbalagens();
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const handleEdit = (emb: Embalagem) => {
        // Only allow editing if it belongs to the company (empresa_id is not null)
        // System defaults (empresa_id === null) cannot be edited
        if (!emb.empresa_id) {
            addToast('Embalagens padrão do sistema não podem ser editadas.', 'info');
            return;
        }
        setSelectedEmbalagem(emb);
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string, empresa_id: string | null) => {
        if (!empresa_id) {
            addToast('Embalagens padrão do sistema não podem ser excluídas.', 'error');
            return;
        }
        const ok = await confirm({
            title: 'Excluir embalagem',
            description: 'Tem certeza que deseja excluir esta embalagem?',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await deleteEmbalagem(id);
            addToast('Embalagem excluída com sucesso!', 'success');
            fetchEmbalagens();
        } catch (error) {
            console.error(error);
            addToast('Erro ao excluir embalagem.', 'error');
        }
    };

    const handleNew = () => {
        setSelectedEmbalagem(null);
        setIsFormOpen(true);
    };

    const handleSave = () => {
        fetchEmbalagens();
    };

    const getIcon = (type: tipo_embalagem) => {
        switch (type) {
            case 'pacote_caixa': return <Box className="w-5 h-5 text-blue-500" />;
            case 'envelope': return <FileText className="w-5 h-5 text-yellow-500" />;
            case 'rolo_cilindro': return <Circle className="w-5 h-5 text-purple-500" />;
            default: return <Package className="w-5 h-5 text-gray-500" />;
        }
    };

    const getDimensionsString = (emb: Embalagem) => {
        const dims = [];
        if (emb.largura) dims.push(`L: ${emb.largura}cm`);
        if (emb.altura) dims.push(`A: ${emb.altura}cm`);
        if (emb.comprimento) dims.push(`C: ${emb.comprimento}cm`);
        if (emb.diametro) dims.push(`Ø: ${emb.diametro}cm`);
        return dims.join(' x ');
    };

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Box className="text-blue-600" /> Cadastro de Embalagens
                    </h1>
                    <div className="text-sm text-gray-500 mt-1 flex gap-2">
                        <span>Cadastros</span>
                        <span>/</span>
                        <span>Embalagens</span>
                    </div>
                </div>
                <Button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Embalagem
                </Button>
            </div>

            <div className="space-y-6 flex-grow flex flex-col">
                <div className="w-full sm:w-96">
                    <Input
                        label=""
                        placeholder="Buscar embalagens..."
                        startAdornment={<Search className="w-4 h-4" />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <GlassCard className="overflow-hidden flex-grow flex flex-col">
                    <div className="overflow-x-auto flex-grow h-0">
                        <table className="w-full text-sm text-left relative">
                            <thead className="bg-gray-50 text-gray-700 font-medium border-b sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4 bg-gray-50">Tipo</th>
                                    <th className="px-6 py-4 bg-gray-50">Nome</th>
                                    <th className="px-6 py-4 bg-gray-50">Dimensões</th>
                                    <th className="px-6 py-4 bg-gray-50">Origem</th>
                                    <th className="px-6 py-4 bg-gray-50">Status</th>
                                    <th className="px-6 py-4 text-right bg-gray-50">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                            Carregando...
                                        </td>
                                    </tr>
                                ) : embalagens.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                            Nenhuma embalagem encontrada.
                                        </td>
                                    </tr>
                                ) : (
                                    embalagens.map((emb) => (
                                        <tr key={emb.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2" title={emb.tipo}>
                                                    {getIcon(emb.tipo)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-900">{emb.nome}</td>
                                            <td className="px-6 py-4 text-gray-600">
                                                {getDimensionsString(emb) || '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                {emb.empresa_id ? (
                                                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">Próprio</span>
                                                ) : (
                                                    <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">Sistema</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`w-2 h-2 rounded-full ${emb.ativo ? 'bg-green-500' : 'bg-red-500'}`} title={emb.ativo ? 'Ativo' : 'Inativo'} />
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {emb.empresa_id && (
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => handleEdit(emb)}
                                                            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(emb.id, emb.empresa_id)}
                                                            className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>
            </div>

            <EmbalagemFormPanel
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSave={handleSave}
                embalagem={selectedEmbalagem}
            />
        </div>
    );
};

export default EmbalagensPage;
