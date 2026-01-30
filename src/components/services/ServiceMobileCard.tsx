import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, Copy, MoreVertical, Wrench } from 'lucide-react';
import { Service } from '@/services/services';
import { formatCurrency, cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ServiceMobileCardProps {
    service: Service;
    onEdit: (service: Service) => void;
    onDelete: (service: Service) => void;
    onClone: (service: Service) => void;
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
}

export function ServiceMobileCard({
    service,
    onEdit,
    onDelete,
    onClone,
    selected,
    onToggleSelect,
}: ServiceMobileCardProps): React.ReactElement {
    const price = service.preco_venda
        ? formatCurrency(Math.round(Number(service.preco_venda) * 100))
        : '—';

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
                        onChange={() => onToggleSelect(service.id)}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`Selecionar ${service.descricao || 'serviço'}`}
                    />
                )}

                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-50 to-violet-50 rounded-lg flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-purple-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                {service.descricao || '(Sem descrição)'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Código: {service.codigo || '—'}
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
                                <DropdownMenuItem onClick={() => onEdit(service)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onClone(service)}>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => onDelete(service)}
                                    className="text-red-600 focus:text-red-600"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-semibold text-gray-900">{price}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{service.unidade || '—'}</span>
                            <span
                                className={cn(
                                    'px-2 py-0.5 text-xs font-medium rounded-full',
                                    service.status === 'ativo'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-600'
                                )}
                            >
                                {service.status === 'ativo' ? 'Ativo' : 'Inativo'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default ServiceMobileCard;
