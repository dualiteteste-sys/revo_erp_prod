import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Copy, Trash2, MoreVertical, Layers, CheckCircle, XCircle, Package } from 'lucide-react';
import { BomListItem } from '@/services/industriaBom';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BomMobileCardProps {
    bom: BomListItem;
    onEdit: (bom: BomListItem) => void;
    onClone?: (bom: BomListItem) => void;
    onDelete?: (bom: BomListItem) => void;
}

const tipoLabel: Record<string, { label: string; color: string }> = {
    producao: { label: 'Produção', color: 'bg-blue-100 text-blue-700' },
    beneficiamento: { label: 'Beneficiamento', color: 'bg-purple-100 text-purple-700' },
    ambos: { label: 'Ambos', color: 'bg-teal-100 text-teal-700' },
};

export function BomMobileCard({
    bom,
    onEdit,
    onClone,
    onDelete,
}: BomMobileCardProps): React.ReactElement {
    const tipo = tipoLabel[bom.tipo_bom] || { label: bom.tipo_bom, color: 'bg-gray-100 text-gray-700' };

    return (
        <motion.div
            className="bg-white rounded-xl border border-gray-100 p-4 transition-all duration-200 hover:border-gray-200 hover:shadow-sm"
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-lg flex items-center justify-center">
                    <Layers className="w-5 h-5 text-indigo-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                    {bom.codigo || `BOM-${bom.id.slice(0, 6)}`}
                                </h3>
                                <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', tipo.color)}>
                                    {tipo.label}
                                </span>
                                {bom.ativo ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                    <XCircle className="w-3.5 h-3.5 text-gray-400" />
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                                <Package className="w-3 h-3 flex-shrink-0" />
                                {bom.produto_nome || 'Produto final'}
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
                                <DropdownMenuItem onClick={() => onEdit(bom)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                {onClone && (
                                    <DropdownMenuItem onClick={() => onClone(bom)}>
                                        <Copy className="w-4 h-4 mr-2" />
                                        Duplicar
                                    </DropdownMenuItem>
                                )}
                                {onDelete && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => onDelete(bom)} className="text-red-600 focus:text-red-600">
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Excluir
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500">
                            Versão {bom.versao}
                        </span>
                        {bom.padrao_para_producao && (
                            <span className="text-xs text-blue-600 font-medium">Padrão Prod.</span>
                        )}
                        {bom.padrao_para_beneficiamento && !bom.padrao_para_producao && (
                            <span className="text-xs text-purple-600 font-medium">Padrão Benef.</span>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default BomMobileCard;
