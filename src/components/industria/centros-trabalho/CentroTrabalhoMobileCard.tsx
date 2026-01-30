import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, MoreVertical, Factory, CheckCircle, XCircle, Clock } from 'lucide-react';
import { CentroTrabalho } from '@/services/industriaCentros';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CentroTrabalhoMobileCardProps {
    centro: CentroTrabalho;
    onEdit: (centro: CentroTrabalho) => void;
    onDelete: (centro: CentroTrabalho) => void;
}

const tipoLabel: Record<string, { label: string; color: string }> = {
    producao: { label: 'Produção', color: 'bg-blue-100 text-blue-700' },
    beneficiamento: { label: 'Beneficiamento', color: 'bg-purple-100 text-purple-700' },
    ambos: { label: 'Ambos', color: 'bg-teal-100 text-teal-700' },
};

export function CentroTrabalhoMobileCard({
    centro,
    onEdit,
    onDelete,
}: CentroTrabalhoMobileCardProps): React.ReactElement {
    const tipo = tipoLabel[centro.tipo_uso] || { label: centro.tipo_uso, color: 'bg-gray-100 text-gray-700' };

    return (
        <motion.div
            className="bg-white rounded-xl border border-gray-100 p-4 transition-all duration-200 hover:border-gray-200 hover:shadow-sm"
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-slate-50 to-gray-100 rounded-lg flex items-center justify-center">
                    <Factory className="w-5 h-5 text-slate-600" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                    {centro.nome}
                                </h3>
                                {centro.ativo ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                    <XCircle className="w-3.5 h-3.5 text-gray-400" />
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-gray-500">{centro.codigo || '—'}</span>
                                <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', tipo.color)}>
                                    {tipo.label}
                                </span>
                            </div>
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
                                <DropdownMenuItem onClick={() => onEdit(centro)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onDelete(centro)} className="text-red-600 focus:text-red-600">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        {centro.capacidade_unidade_hora && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {centro.capacidade_unidade_hora} un/h
                            </span>
                        )}
                        {centro.capacidade_horas_dia && (
                            <span className="text-xs text-gray-500">
                                {centro.capacidade_horas_dia}h/dia
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default CentroTrabalhoMobileCard;
