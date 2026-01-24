import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, FolderTree } from 'lucide-react';
import { useToast } from '../../contexts/ToastProvider';
import { useConfirm } from '../../contexts/ConfirmProvider';
import { listProdutoGrupos, upsertProdutoGrupo, deleteProdutoGrupo, ProdutoGrupo, ProdutoGrupoPayload } from '../../services/produtoGrupos';
import Modal from '../../components/ui/Modal';
import GrupoProdutoForm from '../../components/cadastros/GrupoProdutoForm';
import { Button } from '../../components/ui/button';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

const GrupoProdutosPage: React.FC = () => {
    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const [grupos, setGrupos] = useState<ProdutoGrupo[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGrupo, setEditingGrupo] = useState<ProdutoGrupo | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [sort, setSort] = useState<SortState<string>>({ column: 'nome', direction: 'asc' });

    const columns: TableColumnWidthDef[] = [
        { id: 'nome', defaultWidth: 520, minWidth: 220 },
        { id: 'acoes', defaultWidth: 180, minWidth: 140 },
    ];
    const { widths, startResize } = useTableColumnWidths({ tableId: 'cadastros:grupos-produtos', columns });

    const sortedGrupos = useMemo(() => {
        return sortRows(
            grupos,
            sort as any,
            [{ id: 'nome', type: 'string', getValue: (g) => g.nome ?? '' }] as const
        );
    }, [grupos, sort]);

    const fetchGrupos = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listProdutoGrupos(searchTerm);
            setGrupos(data);
        } catch (error: any) {
            addToast('Erro ao carregar grupos: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, addToast]);

    useEffect(() => {
        fetchGrupos();
    }, [fetchGrupos]);

    const handleOpenModal = (grupo?: ProdutoGrupo) => {
        setEditingGrupo(grupo || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingGrupo(null);
    };

    const handleSave = async (payload: ProdutoGrupoPayload) => {
        setIsSaving(true);
        try {
            await upsertProdutoGrupo(payload);
            addToast('Grupo salvo com sucesso!', 'success');
            handleCloseModal();
            fetchGrupos();
        } catch (error: any) {
            addToast('Erro ao salvar grupo: ' + error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir grupo',
            description: 'Tem certeza que deseja excluir este grupo? Esta ação não pode ser desfeita.',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            variant: 'danger',
        });
        if (!ok) return;

        try {
            await deleteProdutoGrupo(id);
            addToast('Grupo excluído com sucesso!', 'success');
            fetchGrupos();
        } catch (error: any) {
            addToast('Erro ao excluir grupo: ' + error.message, 'error');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <FolderTree className="text-blue-600" size={28} />
                    <h1 className="text-2xl font-bold text-gray-800">Grupos de Produtos</h1>
                </div>
                <div className="flex items-center gap-2">
                    <CsvExportDialog
                        filename="grupos-produtos.csv"
                        rows={grupos}
                        disabled={loading}
                        columns={[
                            { key: 'nome', label: 'Nome', getValue: (r) => r.nome },
                        ]}
                    />
                    <Button onClick={() => handleOpenModal()}>
                        <Plus size={20} className="mr-2" />
                        Novo Grupo
                    </Button>
                </div>
            </div>

            <div className="mb-6 relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type="text"
                    placeholder="Buscar grupos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <TableColGroup columns={columns} widths={widths} />
                    <thead className="bg-gray-50">
                        <tr>
                            <ResizableSortableTh
                                columnId="nome"
                                label="Nome"
                                sort={sort as any}
                                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                                onResizeStart={startResize as any}
                            />
                            <ResizableSortableTh
                                columnId="acoes"
                                label="Ações"
                                align="right"
                                sortable={false}
                                resizable
                                onResizeStart={startResize as any}
                            />
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan={2} className="px-6 py-4 text-center text-gray-500">Carregando...</td>
                            </tr>
                        ) : grupos.length === 0 ? (
                            <tr>
                                <td colSpan={2} className="px-6 py-4 text-center text-gray-500">Nenhum grupo encontrado.</td>
                            </tr>
                        ) : (
                            sortedGrupos.map((grupo) => (
                                <tr key={grupo.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{grupo.nome}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleOpenModal(grupo)}
                                            className="text-blue-600 hover:text-blue-900 mr-4"
                                            title="Editar"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(grupo.id)}
                                            className="text-red-600 hover:text-red-900"
                                            title="Excluir"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingGrupo ? 'Editar Grupo' : 'Novo Grupo'}
                bodyClassName="p-6 md:p-8"
            >
                <GrupoProdutoForm
                    grupo={editingGrupo}
                    onSave={handleSave}
                    onCancel={handleCloseModal}
                    isLoading={isSaving}
                />
            </Modal>
        </div>
    );
};

export default GrupoProdutosPage;
