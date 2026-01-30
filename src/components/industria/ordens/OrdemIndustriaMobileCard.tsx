import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Eye, Copy, Trash2, MoreVertical, Factory, Calendar, Package } from 'lucide-react';
import { OrdemIndustria } from '@/services/industria';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface OrdemIndustriaMobileCardProps {
    order: OrdemIndustria;
    onEdit: (order: OrdemIndustria) => void;
    onClone?: (order: OrdemIndustria) => void;
    onDelete?: (order: OrdemIndustria) => void;
}

const statusColors: Record<string, string> = {
    rascunho: 'bg-gray-100 text-gray-700',
    planejada: 'bg-blue-100 text-blue-700',
    em_programacao: 'bg-indigo-100 text-indigo-700',
    em_producao: 'bg-yellow-100 text-yellow-700',
    em_inspecao: 'bg-purple-100 text-purple-700',
    parcialmente_concluida: 'bg-teal-100 text-teal-700',
    concluida: 'bg-green-100 text-green-700',
    cancelada: 'bg-red-100 text-red-700',
};

const statusLabels: Record<string, string> = {
    rascunho: 'Rascunho',
    planejada: 'Planejada',
    em_programacao: 'Em Programação',
    em_producao: 'Em Produção',
    em_inspecao: 'Em Inspeção',
    parcialmente_concluida: 'Parcial',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
};

function formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('pt-BR');
}

export function OrdemIndustriaMobileCard({
    order,
    onEdit,
    onClone,
    onDelete,
}: OrdemIndustriaMobileCardProps): React.ReactElement {
    const isEditable = order.status === 'rascunho' || order.status === 'planejada';
    const isDeletable = order.status === 'rascunho';

    return (
        <motion.div
            className="bg-white rounded-xl border border-gray-100 p-4 transition-all duration-200 hover:border-gray-200 hover:shadow-sm"
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg flex items-center justify-center">
                    <Factory className="w-5 h-5 text-amber-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                                    OP #{order.numero}
                                </h3>
                                <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', statusColors[order.status] || 'bg-gray-100')}>
                                    {statusLabels[order.status] || order.status}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                                <Package className="w-3 h-3 flex-shrink-0" />
                                {order.produto_nome || 'Produto não informado'}
                            </p>
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className="p-1.5 -mr-1 rounded-lg hover:bg-gray-100 transition-colors"
                                    aria-label="Ações"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-400" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => onEdit(order)}>
                                    {isEditable ? <Edit className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                                    {isEditable ? 'Editar' : 'Visualizar'}
                                </DropdownMenuItem>
                                {onClone && (
                                    <DropdownMenuItem onClick={() => onClone(order)}>
                                        <Copy className="w-4 h-4 mr-2" />
                                        Duplicar
                                    </DropdownMenuItem>
                                )}
                                {onDelete && isDeletable && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => onDelete(order)} className="text-red-600 focus:text-red-600">
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Excluir
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(order.data_prevista_entrega)}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                            Qtd: {order.quantidade_planejada || 0}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default OrdemIndustriaMobileCard;
