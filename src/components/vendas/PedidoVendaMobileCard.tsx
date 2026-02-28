import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Eye, FileText, MoreVertical, ShoppingCart, Calendar, User } from 'lucide-react';
import { VendaPedido } from '@/services/vendas';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PedidoVendaMobileCardProps {
    order: VendaPedido;
    onEdit: (order: VendaPedido) => void;
    onGerarNfe?: (order: VendaPedido) => void;
}

const statusColors: Record<string, string> = {
    orcamento: 'bg-gray-100 text-gray-700',
    aprovado: 'bg-green-100 text-green-700',
    concluido: 'bg-blue-100 text-blue-700',
    cancelado: 'bg-red-100 text-red-700',
};

const statusLabels: Record<string, string> = {
    orcamento: 'Orçamento',
    aprovado: 'Aprovado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
};

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('pt-BR');
}

export function PedidoVendaMobileCard({
    order,
    onEdit,
    onGerarNfe,
}: PedidoVendaMobileCardProps): React.ReactElement {
    const isEditable = order.status === 'orcamento';

    return (
        <motion.div
            className="bg-white rounded-xl border border-gray-100 p-4 transition-all duration-200 hover:border-gray-200 hover:shadow-sm"
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-indigo-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                                    #{order.numero}
                                </h3>
                                <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', statusColors[order.status] || 'bg-gray-100')}>
                                    {statusLabels[order.status] || order.status}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                                <User className="w-3 h-3 flex-shrink-0" />
                                {order.cliente_nome || 'Cliente não informado'}
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
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => onEdit(order)}>
                                    {isEditable ? <Edit className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                                    {isEditable ? 'Editar' : 'Visualizar'}
                                </DropdownMenuItem>
                                {onGerarNfe && ['aprovado', 'concluido'].includes(order.status) && (
                                    <DropdownMenuItem onClick={() => onGerarNfe(order)}>
                                        <FileText className="w-4 h-4 mr-2" />
                                        Gerar NF-e
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(order.data_emissao)}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(order.total_geral)}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default PedidoVendaMobileCard;
