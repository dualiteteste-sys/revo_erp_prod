import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, MoreVertical, DollarSign, Calendar, User, CheckCircle2, Ban, RotateCcw } from 'lucide-react';
import { ContaAReceber } from '@/services/contasAReceber';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ContaAReceberMobileCardProps {
    conta: ContaAReceber;
    onEdit: (conta: ContaAReceber) => void;
    onReceive?: (conta: ContaAReceber) => void;
    onCancel?: (conta: ContaAReceber) => void;
    onReverse?: (conta: ContaAReceber) => void;
    onDelete: (conta: ContaAReceber) => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
    pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700' },
    pago: { label: 'Pago', color: 'bg-green-100 text-green-700' },
    vencido: { label: 'Vencido', color: 'bg-red-100 text-red-700' },
    cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-600' },
};

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('pt-BR');
}

export function ContaAReceberMobileCard({
    conta,
    onEdit,
    onReceive,
    onCancel,
    onReverse,
    onDelete,
}: ContaAReceberMobileCardProps): React.ReactElement {
    const status = statusConfig[conta.status] || { label: conta.status, color: 'bg-gray-100 text-gray-700' };
    const canReceive = conta.status === 'pendente' || conta.status === 'vencido';
    const canReverse = conta.status === 'pago';
    const canCancel = conta.status === 'pendente' || conta.status === 'vencido';

    return (
        <motion.div
            className="bg-white rounded-xl border border-gray-100 p-4 transition-all duration-200 hover:border-gray-200 hover:shadow-sm"
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                {conta.descricao || '(Sem descrição)'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                                <User className="w-3 h-3 flex-shrink-0" />
                                {conta.cliente_nome || 'Cliente não informado'}
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
                                {onReceive && canReceive && (
                                    <DropdownMenuItem onClick={() => onReceive(conta)}>
                                        <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />
                                        Registrar recebimento
                                    </DropdownMenuItem>
                                )}
                                {onReverse && canReverse && (
                                    <DropdownMenuItem onClick={() => onReverse(conta)}>
                                        <RotateCcw className="w-4 h-4 mr-2 text-amber-600" />
                                        Estornar recebimento
                                    </DropdownMenuItem>
                                )}
                                {onCancel && canCancel && (
                                    <DropdownMenuItem onClick={() => onCancel(conta)}>
                                        <Ban className="w-4 h-4 mr-2" />
                                        Cancelar
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onEdit(conta)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onDelete(conta)} className="text-red-600 focus:text-red-600">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(conta.data_vencimento)}
                            </span>
                            <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', status.color)}>
                                {status.label}
                            </span>
	                        </div>
	                        <span className="text-sm font-semibold text-gray-900">
	                            {formatCurrency(Number(conta.valor ?? 0))}
	                        </span>
	                    </div>
	                </div>
	            </div>
	        </motion.div>
    );
}

export default ContaAReceberMobileCard;
