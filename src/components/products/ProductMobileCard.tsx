import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, Copy, MoreVertical, Package } from 'lucide-react';
import { Product } from '@/services/products';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProductMobileCardProps {
    product: Product;
    onEdit: (product: Product) => void;
    onDelete: (product: Product) => void;
    onClone: (product: Product) => void;
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
}

/**
 * Card mobile para exibição de produtos
 * Substitui a linha da tabela em dispositivos móveis
 */
export function ProductMobileCard({
    product,
    onEdit,
    onDelete,
    onClone,
    selected,
    onToggleSelect,
}: ProductMobileCardProps): React.ReactElement {
    const price = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(product.preco_venda ?? 0);

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
                {/* Checkbox (se seleção habilitada) */}
                {onToggleSelect && (
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect(product.id)}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`Selecionar ${product.nome || 'produto'}`}
                    />
                )}

                {/* Ícone/Thumbnail */}
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-blue-500" />
                </div>

                {/* Conteúdo principal */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                                {product.nome || '(Sem nome)'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                SKU: {product.sku || '—'}
                            </p>
                        </div>

                        {/* Menu de ações */}
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
                                <DropdownMenuItem onClick={() => onEdit(product)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onClone(product)}>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => onDelete(product)}
                                    className="text-red-600 focus:text-red-600"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Linha inferior com preço e status */}
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-semibold text-gray-900">{price}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{product.unidade}</span>
                            <span
                                className={cn(
                                    'px-2 py-0.5 text-xs font-medium rounded-full',
                                    product.status === 'ativo'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                )}
                            >
                                {product.status === 'ativo' ? 'Ativo' : 'Inativo'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default ProductMobileCard;
