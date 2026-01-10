import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Package, Edit2, Trash2, Box, FileText, Circle } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import Input from '../../components/ui/forms/Input';
import { Button } from '../../components/ui/button';
import { Embalagem, listEmbalagens, deleteEmbalagem } from '../../services/embalagens';
import EmbalagemFormPanel from '../../components/cadastros/EmbalagemFormPanel';
import { useToast } from '../../contexts/ToastProvider';
import { tipo_embalagem } from '../../types/database.types';
import { useConfirm } from '@/contexts/ConfirmProvider';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

const EmbalagensPage: React.FC = () => {
    const [embalagens, setEmbalagens] = useState<Embalagem[]>([]);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedEmbalagem, setSelectedEmbalagem] = useState<Embalagem | null>(null);
    const [sort, setSort] = useState<SortState<string>>({ column: 'nome', direction: 'asc' });
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

    const columns: TableColumnWidthDef[] = [
        { id: 'tipo', defaultWidth: 120, minWidth: 90 },
        { id: 'nome', defaultWidth: 360, minWidth: 220 },
        { id: 'dimensoes', defaultWidth: 260, minWidth: 200 },
        { id: 'origem', defaultWidth: 160, minWidth: 140 },
        { id: 'status', defaultWidth: 120, minWidth: 100 },
        { id: 'acoes', defaultWidth: 140, minWidth: 120 },
    ];
    const { widths, startResize } = useTableColumnWidths({ tableId: 'cadastros:embalagens', columns });

    const sortedEmbalagens = useMemo(() => {
        return sortRows(
            embalagens,
            sort as any,
            [
                { id: 'tipo', type: 'string', getValue: (e) => String(e.tipo ?? '') },
                { id: 'nome', type: 'string', getValue: (e) => e.nome ?? '' },
                { id: 'dimensoes', type: 'string', getValue: (e) => getDimensionsString(e) },
                { id: 'origem', type: 'string', getValue: (e) => (e.empresa_id ? 'Próprio' : 'Sistema') },
                { id: 'status', type: 'boolean', getValue: (e) => Boolean(e.ativo) },
            ] as const
        );
    }, [embalagens, sort]);

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
                <div className="flex items-center gap-2">
                    <CsvExportDialog
                        filename="embalagens.csv"
                        rows={embalagens}
                        disabled={isLoading}
                        columns={[
                            { key: 'nome', label: 'Nome', getValue: (r) => r.nome },
                            { key: 'tipo', label: 'Tipo', getValue: (r) => r.tipo },
                            { key: 'largura', label: 'Largura (cm)', getValue: (r) => r.largura ?? '' },
                            { key: 'altura', label: 'Altura (cm)', getValue: (r) => r.altura ?? '' },
                            { key: 'comprimento', label: 'Comprimento (cm)', getValue: (r) => r.comprimento ?? '' },
                            { key: 'diametro', label: 'Diâmetro (cm)', getValue: (r) => r.diametro ?? '' },
                            { key: 'origem', label: 'Origem', getValue: (r) => (r.empresa_id ? 'Próprio' : 'Sistema') },
                            { key: 'status', label: 'Status', getValue: (r) => (r.ativo ? 'Ativo' : 'Inativo') },
                        ]}
                    />
                    <Button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="w-4 h-4 mr-2" />
                        Nova Embalagem
                    </Button>
                </div>
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
                            <TableColGroup columns={columns} widths={widths} />
                            <thead className="bg-gray-50 text-gray-700 font-medium border-b sticky top-0 z-10">
                                <tr>
                                    <ResizableSortableTh
                                        columnId="tipo"
                                        label="Tipo"
                                        className="px-6 py-4 bg-gray-50 normal-case tracking-normal"
                                        sort={sort as any}
                                        onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startResize as any}
                                    />
                                    <ResizableSortableTh
                                        columnId="nome"
                                        label="Nome"
                                        className="px-6 py-4 bg-gray-50 normal-case tracking-normal"
                                        sort={sort as any}
                                        onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startResize as any}
                                    />
                                    <ResizableSortableTh
                                        columnId="dimensoes"
                                        label="Dimensões"
                                        className="px-6 py-4 bg-gray-50 normal-case tracking-normal"
                                        sort={sort as any}
                                        onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startResize as any}
                                    />
                                    <ResizableSortableTh
                                        columnId="origem"
                                        label="Origem"
                                        className="px-6 py-4 bg-gray-50 normal-case tracking-normal"
                                        sort={sort as any}
                                        onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startResize as any}
                                    />
                                    <ResizableSortableTh
                                        columnId="status"
                                        label="Status"
                                        className="px-6 py-4 bg-gray-50 normal-case tracking-normal"
                                        sort={sort as any}
                                        onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                                        onResizeStart={startResize as any}
                                    />
                                    <ResizableSortableTh
                                        columnId="acoes"
                                        label="Ações"
                                        align="right"
                                        className="px-6 py-4 bg-gray-50 normal-case tracking-normal"
                                        sortable={false}
                                        resizable
                                        onResizeStart={startResize as any}
                                    />
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
                                    sortedEmbalagens.map((emb) => (
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
