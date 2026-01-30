import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Copy, Trash2, MoreVertical, Route, CheckCircle, XCircle, Package } from 'lucide-react';
import { RoteiroListItem } from '@/services/industriaRoteiros';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface RoteiroMobileCardProps {
    roteiro: RoteiroListItem;
    onEdit: (roteiro: RoteiroListItem) => void;
    onClone: (roteiro: RoteiroListItem) => void;
    onDelete: (roteiro: RoteiroListItem) => void;
}

const tipoLabel: Record<string, { label: string; color: string }> = {
    producao: { label: 'Produção', color: 'bg-blue-100 text-blue-700' },
    beneficiamento: { label: 'Beneficiamento', color: 'bg-purple-100 text-purple-700' },
    ambos: { label: 'Ambos', color: 'bg-teal-100 text-teal-700' },
};

export function RoteiroMobileCard({
    roteiro,
    onEdit,
    onClone,
    onDelete,
}: RoteiroMobileCardProps): React.ReactElement {
    const tipo = tipoLabel[roteiro.tipo_bom] || { label: roteiro.tipo_bom, color: 'bg-gray-100 text-gray-700' };

    return (
        <motion.div
            className="bg-white rounded-xl border border-gray-100 p-4 transition-all duration-200 hover:border-gray-200 hover:shadow-sm"
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg flex items-center justify-center">
                    <Route className="w-5 h-5 text-orange-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                    {roteiro.codigo || `ROT-${roteiro.id.slice(0, 6)}`}
                                </h3>
                                <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', tipo.color)}>
                                    {tipo.label}
                                </span>
                                {roteiro.ativo ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                    <XCircle className="w-3.5 h-3.5 text-gray-400" />
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                                <Package className="w-3 h-3 flex-shrink-0" />
                                {roteiro.produto_nome || 'Produto'}
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
                                <DropdownMenuItem onClick={() => onEdit(roteiro)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onClone(roteiro)}>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onDelete(roteiro)} className="text-red-600 focus:text-red-600">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500">
                            Versão {roteiro.versao}
                        </span>
                        <span className="text-xs text-gray-500 truncate max-w-[120px]">
                            {roteiro.descricao || ''}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default RoteiroMobileCard;
