import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, MoreVertical, Truck } from 'lucide-react';
import { CarrierListItem } from '@/services/carriers';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CarrierMobileCardProps {
    carrier: CarrierListItem;
    onEdit: (carrier: CarrierListItem) => void;
    onDelete: (carrier: CarrierListItem) => void;
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
}

function formatDocument(doc: string | null): string {
    if (!doc) return '—';
    const digits = doc.replace(/\D/g, '');
    if (digits.length === 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (digits.length === 14) {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return doc;
}

export function CarrierMobileCard({
    carrier,
    onEdit,
    onDelete,
    selected,
    onToggleSelect,
}: CarrierMobileCardProps): React.ReactElement {
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
                        onChange={() => onToggleSelect(carrier.id)}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`Selecionar ${carrier.nome || 'transportadora'}`}
                    />
                )}

                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg flex items-center justify-center">
                    <Truck className="w-5 h-5 text-orange-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                {carrier.nome || '(Sem nome)'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {formatDocument(carrier.documento)}
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
                                <DropdownMenuItem onClick={() => onEdit(carrier)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => onDelete(carrier)}
                                    className="text-red-600 focus:text-red-600"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        {carrier.cidade && <span>{carrier.cidade}</span>}
                        {carrier.prazo_medio_dias && <span>• {carrier.prazo_medio_dias}d</span>}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default CarrierMobileCard;
