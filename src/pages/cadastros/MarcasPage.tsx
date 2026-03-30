import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, Tag } from 'lucide-react';
import { useToast } from '../../contexts/ToastProvider';
import { useConfirm } from '../../contexts/ConfirmProvider';
import { listMarcas, upsertMarca, deleteMarca, Marca, MarcaPayload } from '../../services/marcas';
import Modal from '../../components/ui/Modal';
import { Button } from '../../components/ui/button';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import Input from '@/components/ui/forms/Input';

interface MarcaFormProps {
    marca?: Marca | null;
    onSave: (payload: MarcaPayload) => Promise<void>;
    onCancel: () => void;
    isLoading?: boolean;
}

const MarcaForm: React.FC<MarcaFormProps> = ({ marca, onSave, onCancel, isLoading }) => {
    const [nome, setNome] = useState('');

    useEffect(() => {
        setNome(marca?.nome ?? '');
    }, [marca]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nome.trim()) return;
        await onSave({ id: marca?.id, nome: nome.trim() });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input
                label="Nome da Marca"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Samsung, Apple, Tramontina..."
                required
            />
            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={isLoading || !nome.trim()}>
                    {isLoading ? 'Salvando...' : 'Salvar'}
                </Button>
            </div>
        </form>
    );
};

const MarcasPage: React.FC = () => {
    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const [marcas, setMarcas] = useState<Marca[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMarca, setEditingMarca] = useState<Marca | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [sort, setSort] = useState<SortState<string>>({ column: 'nome', direction: 'asc' });

    const columns: TableColumnWidthDef[] = [
        { id: 'nome', defaultWidth: 520, minWidth: 220 },
        { id: 'acoes', defaultWidth: 180, minWidth: 140 },
    ];
    const { widths, startResize } = useTableColumnWidths({ tableId: 'cadastros:marcas', columns });

    const sortedMarcas = useMemo(() => {
        return sortRows(
            marcas,
            sort as any,
            [{ id: 'nome', type: 'string', getValue: (m: Marca) => m.nome ?? '' }] as const
        );
    }, [marcas, sort]);

    const fetchMarcas = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listMarcas(searchTerm);
            setMarcas(data);
        } catch (error: any) {
            addToast('Erro ao carregar marcas: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, addToast]);

    useEffect(() => {
        fetchMarcas();
    }, [fetchMarcas]);

    const handleOpenModal = (marca?: Marca) => {
        setEditingMarca(marca || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingMarca(null);
    };

    const handleSave = async (payload: MarcaPayload) => {
        setIsSaving(true);
        try {
            await upsertMarca(payload);
            addToast('Marca salva com sucesso!', 'success');
            handleCloseModal();
            fetchMarcas();
        } catch (error: any) {
            addToast('Erro ao salvar marca: ' + error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir marca',
            description: 'Tem certeza que deseja excluir esta marca? Esta ação não pode ser desfeita.',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            variant: 'danger',
        });
        if (!ok) return;

        try {
            await deleteMarca(id);
            addToast('Marca excluída com sucesso!', 'success');
            fetchMarcas();
        } catch (error: any) {
            addToast('Erro ao excluir marca: ' + error.message, 'error');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <Tag className="text-blue-600" size={28} />
                    <h1 className="text-2xl font-bold text-gray-800">Marcas</h1>
                </div>
                <div className="flex items-center gap-2">
                    <CsvExportDialog
                        filename="marcas.csv"
                        rows={marcas}
                        disabled={loading}
                        columns={[
                            { key: 'nome', label: 'Nome', getValue: (r) => r.nome },
                        ]}
                    />
                    <Button onClick={() => handleOpenModal()}>
                        <Plus size={20} className="mr-2" />
                        Nova Marca
                    </Button>
                </div>
            </div>

            <div className="mb-6 relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type="text"
                    placeholder="Buscar marcas..."
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
                        ) : marcas.length === 0 ? (
                            <tr>
                                <td colSpan={2} className="px-6 py-4 text-center text-gray-500">Nenhuma marca encontrada.</td>
                            </tr>
                        ) : (
                            sortedMarcas.map((marca) => (
                                <tr key={marca.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{marca.nome}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleOpenModal(marca)}
                                            className="text-blue-600 hover:text-blue-900 mr-4"
                                            title="Editar"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(marca.id)}
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
                title={editingMarca ? 'Editar Marca' : 'Nova Marca'}
                bodyClassName="p-6 md:p-8"
            >
                <MarcaForm
                    marca={editingMarca}
                    onSave={handleSave}
                    onCancel={handleCloseModal}
                    isLoading={isSaving}
                />
            </Modal>
        </div>
    );
};

export default MarcasPage;
