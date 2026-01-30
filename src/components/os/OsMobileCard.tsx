import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, MoreVertical, ClipboardList, Calendar, User } from 'lucide-react';
import { OrdemServico, status_os } from '@/services/os';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface OsMobileCardProps {
    os: OrdemServico;
    onEdit: (os: OrdemServico) => void;
    onDelete: (os: OrdemServico) => void;
    onSetStatus?: (os: OrdemServico, status: status_os) => void;
    canUpdate?: boolean;
    canDelete?: boolean;
    busyOsId?: string | null;
}

const statusConfig: Record<status_os, { label: string; color: string }> = {
    orcamento: { label: 'Orçamento', color: 'bg-gray-100 text-gray-700' },
    aberta: { label: 'Aberta', color: 'bg-blue-100 text-blue-700' },
    concluida: { label: 'Concluída', color: 'bg-green-100 text-green-700' },
    cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-700' },
};

function formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('pt-BR');
}

function formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function OsMobileCard({
    os,
    onEdit,
    onDelete,
    onSetStatus,
    canUpdate = true,
    canDelete = true,
    busyOsId,
}: OsMobileCardProps): React.ReactElement {
    const status = statusConfig[os.status] || { label: os.status, color: 'bg-gray-100 text-gray-700' };
    const isBusy = busyOsId === os.id;

    return (
        <motion.div
            className={cn(
                'bg-white rounded-xl border p-4 transition-all duration-200',
                isBusy && 'opacity-50 pointer-events-none',
                'border-gray-100 hover:border-gray-200 hover:shadow-sm'
            )}
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-emerald-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                                    OS #{os.numero || os.id.slice(0, 8)}
                                </h3>
                                <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', status.color)}>
                                    {status.label}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {os.cliente_nome || 'Cliente não informado'}
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
                            <DropdownMenuContent align="end" className="w-44">
                                {canUpdate && (
                                    <DropdownMenuItem onClick={() => onEdit(os)}>
                                        <Edit className="w-4 h-4 mr-2" />
                                        Editar
                                    </DropdownMenuItem>
                                )}
                                {onSetStatus && canUpdate && (
                                    <>
                                        <DropdownMenuSeparator />
                                        {os.status !== 'aberta' && (
                                            <DropdownMenuItem onClick={() => onSetStatus(os, 'aberta')}>
                                                Marcar como Aberta
                                            </DropdownMenuItem>
                                        )}
                                        {os.status !== 'concluida' && (
                                            <DropdownMenuItem onClick={() => onSetStatus(os, 'concluida')}>
                                                Marcar como Concluída
                                            </DropdownMenuItem>
                                        )}
                                        {os.status !== 'cancelada' && (
                                            <DropdownMenuItem onClick={() => onSetStatus(os, 'cancelada')}>
                                                Cancelar OS
                                            </DropdownMenuItem>
                                        )}
                                    </>
                                )}
                                {canDelete && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={() => onDelete(os)}
                                            className="text-red-600 focus:text-red-600"
                                        >
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
                            {formatDate(os.data_inicio)}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(os.total_geral)}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default OsMobileCard;
