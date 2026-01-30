import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, MoreVertical, Receipt, Calendar, User, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { CobrancaBancaria } from '@/services/cobrancas';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('pt-BR');
}

interface CobrancaMobileCardProps {
    cobranca: CobrancaBancaria;
    onEdit: (cobranca: CobrancaBancaria) => void;
    onDelete: (cobranca: CobrancaBancaria) => void;
}

const statusConfig: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
    pendente_emissao: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700', Icon: Clock },
    emitida: { label: 'Emitida', color: 'bg-blue-100 text-blue-700', Icon: Receipt },
    registrada: { label: 'Registrada', color: 'bg-indigo-100 text-indigo-700', Icon: Receipt },
    enviada: { label: 'Enviada', color: 'bg-purple-100 text-purple-700', Icon: Receipt },
    liquidada: { label: 'Liquidada', color: 'bg-green-100 text-green-700', Icon: CheckCircle },
    baixada: { label: 'Baixada', color: 'bg-gray-100 text-gray-700', Icon: CheckCircle },
    cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-400', Icon: XCircle },
    erro: { label: 'Erro', color: 'bg-red-100 text-red-700', Icon: AlertCircle },
};

const tipoLabel: Record<string, string> = {
    boleto: 'Boleto',
    pix: 'Pix',
    carne: 'Carnê',
    link_pagamento: 'Link Pgto',
    outro: 'Outro',
};

export function CobrancaMobileCard({
    cobranca,
    onEdit,
    onDelete,
}: CobrancaMobileCardProps): React.ReactElement {
    const config = statusConfig[cobranca.status] || statusConfig.pendente_emissao;
    const StatusIcon = config.Icon;

    const formattedValue = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(cobranca.valor_atual);

    return (
        <motion.div
            className="bg-white rounded-xl border border-gray-100 p-4 transition-all duration-200 hover:border-gray-200 hover:shadow-sm"
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-emerald-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                    {cobranca.documento_ref || `COB-${cobranca.id.slice(0, 6)}`}
                                </h3>
                                <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1', config.color)}>
                                    <StatusIcon className="w-3 h-3" />
                                    {config.label}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                                <User className="w-3 h-3 flex-shrink-0" />
                                {cobranca.cliente_nome || 'Cliente não informado'}
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
                                <DropdownMenuItem onClick={() => onEdit(cobranca)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onDelete(cobranca)} className="text-red-600 focus:text-red-600">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                {tipoLabel[cobranca.tipo_cobranca] || 'Outro'}
                            </span>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(cobranca.data_vencimento)}
                            </span>
                        </div>
                        <span className="font-semibold text-sm text-gray-900">
                            {formattedValue}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default CobrancaMobileCard;
