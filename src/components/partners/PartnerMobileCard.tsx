import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, RotateCcw, MoreVertical, Users } from 'lucide-react';
import { PartnerListItem } from '@/services/partners';
import { documentMask } from '@/lib/masks';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PartnerMobileCardProps {
    partner: PartnerListItem;
    onEdit: (partner: PartnerListItem) => void;
    onDelete: (partner: PartnerListItem) => void;
    onRestore?: (partner: PartnerListItem) => void;
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
}

const tipoLabels: Record<string, { label: string; color: string }> = {
    cliente: { label: 'Cliente', color: 'bg-blue-100 text-blue-700' },
    fornecedor: { label: 'Fornecedor', color: 'bg-yellow-100 text-yellow-700' },
    ambos: { label: 'Ambos', color: 'bg-purple-100 text-purple-700' },
};

export function PartnerMobileCard({
    partner,
    onEdit,
    onDelete,
    onRestore,
    selected,
    onToggleSelect,
}: PartnerMobileCardProps): React.ReactElement {
    const tipoConfig = tipoLabels[partner.tipo] || { label: partner.tipo, color: 'bg-gray-100 text-gray-700' };
    const isInactive = !!partner.deleted_at;

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
                        onChange={() => onToggleSelect(partner.id)}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`Selecionar ${partner.nome || 'parceiro'}`}
                    />
                )}

                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-indigo-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                {partner.nome || '(Sem nome)'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {partner.doc_unico ? documentMask(partner.doc_unico) : '—'}
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
                                <DropdownMenuItem onClick={() => onEdit(partner)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                {isInactive && onRestore ? (
                                    <DropdownMenuItem onClick={() => onRestore(partner)}>
                                        <RotateCcw className="w-4 h-4 mr-2" />
                                        Reativar
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem
                                        onClick={() => onDelete(partner)}
                                        className="text-red-600 focus:text-red-600"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Inativar
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', tipoConfig.color)}>
                            {tipoConfig.label}
                        </span>
                        <span
                            className={cn(
                                'px-2 py-0.5 text-xs font-medium rounded-full',
                                isInactive ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
                            )}
                        >
                            {isInactive ? 'Inativo' : 'Ativo'}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default PartnerMobileCard;
