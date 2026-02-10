import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, MoreVertical, CreditCard, Calendar, Building2, CheckCircle2, Ban, RotateCcw } from 'lucide-react';
import { ContaPagar } from '@/services/financeiro';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ContaPagarMobileCardProps {
    conta: ContaPagar;
    onEdit: (conta: ContaPagar) => void;
    onPay?: (conta: ContaPagar) => void;
    onCancel?: (conta: ContaPagar) => void;
    onReverse?: (conta: ContaPagar) => void;
    onDelete: (conta: ContaPagar) => void;
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
    aberta: { label: 'Aberta', color: 'bg-yellow-100 text-yellow-700' },
    parcial: { label: 'Parcial', color: 'bg-blue-100 text-blue-700' },
    paga: { label: 'Paga', color: 'bg-green-100 text-green-700' },
    cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-600' },
};

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('pt-BR');
}

export function ContaPagarMobileCard({
    conta,
    onEdit,
    onPay,
    onCancel,
    onReverse,
    onDelete,
    selected,
    onToggleSelect,
}: ContaPagarMobileCardProps): React.ReactElement {
    const status = statusConfig[conta.status] || { label: conta.status, color: 'bg-gray-100 text-gray-700' };
    const canPay = conta.status === 'aberta' || conta.status === 'parcial';
    const canReverse = conta.status === 'paga';
    const canCancel = conta.status === 'aberta' || conta.status === 'parcial';

    return (
        <motion.div
            className={cn(
                'bg-white rounded-xl border p-4 transition-all duration-200',
                selected
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                    : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
            )}
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start gap-3">
                {onToggleSelect && (
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect(conta.id)}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`Selecionar ${conta.descricao || 'conta a pagar'}`}
                    />
                )}
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-red-50 to-rose-50 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-red-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                {conta.descricao || '(Sem descrição)'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                                <Building2 className="w-3 h-3 flex-shrink-0" />
                                {conta.fornecedor_nome || 'Fornecedor não informado'}
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
                                {onPay && canPay && (
                                    <DropdownMenuItem onClick={() => onPay(conta)}>
                                        <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />
                                        Registrar pagamento
                                    </DropdownMenuItem>
                                )}
                                {onReverse && canReverse && (
                                    <DropdownMenuItem onClick={() => onReverse(conta)}>
                                        <RotateCcw className="w-4 h-4 mr-2 text-amber-600" />
                                        Estornar pagamento
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
                        <div className="text-right">
                            <span className="text-sm font-semibold text-gray-900 block">
                                {formatCurrency(conta.valor_total)}
                            </span>
                            {conta.saldo !== undefined && conta.saldo !== conta.valor_total && (
                                <span className="text-xs text-gray-500">
                                    Saldo: {formatCurrency(conta.saldo || 0)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default ContaPagarMobileCard;
