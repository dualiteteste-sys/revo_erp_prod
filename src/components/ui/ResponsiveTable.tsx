import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';

/**
 * Props para o componente ResponsiveTable
 * @template T - Tipo dos itens de dados
 */
export interface ResponsiveTableProps<T> {
    /** Dados a serem exibidos */
    data: T[];
    /** Componente de tabela para desktop */
    tableComponent: React.ReactNode;
    /** Render function para cards mobile */
    renderMobileCard: (item: T, index: number) => React.ReactNode;
    /** ID único do item para key */
    getItemId: (item: T) => string;
    /** Loading state */
    loading?: boolean;
    /** Classe adicional para container mobile */
    mobileClassName?: string;
    /** Mostrar separadores entre cards */
    showDividers?: boolean;
}

/**
 * ResponsiveTable - Wrapper que alterna entre tabela (desktop) e cards (mobile)
 * 
 * @example
 * ```tsx
 * <ResponsiveTable
 *   data={products}
 *   tableComponent={<ProductsTable products={products} ... />}
 *   renderMobileCard={(product, index) => (
 *     <ProductMobileCard key={product.id} product={product} ... />
 *   )}
 *   getItemId={(p) => p.id}
 * />
 * ```
 */
export function ResponsiveTable<T>({
    data,
    tableComponent,
    renderMobileCard,
    getItemId,
    loading = false,
    mobileClassName,
    showDividers = true,
}: ResponsiveTableProps<T>): React.ReactElement {
    const isMobile = useIsMobile();

    // Desktop: renderiza tabela normal
    if (!isMobile) {
        return <>{tableComponent}</>;
    }

    // Mobile: renderiza lista de cards
    return (
        <div className={cn('flex flex-col', mobileClassName)}>
            {loading ? (
                // Skeleton loading para mobile
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : data.length === 0 ? (
                // Estado vazio
                <div className="py-12 text-center text-gray-500">
                    <p className="text-sm">Nenhum item encontrado</p>
                </div>
            ) : (
                // Lista de cards
                <motion.div
                    className={cn(
                        'space-y-2',
                        showDividers && 'divide-y divide-gray-100'
                    )}
                    initial="hidden"
                    animate="visible"
                    variants={{
                        visible: { transition: { staggerChildren: 0.05 } },
                        hidden: {},
                    }}
                >
                    <AnimatePresence mode="popLayout">
                        {data.map((item, index) => (
                            <motion.div
                                key={getItemId(item)}
                                variants={{
                                    hidden: { opacity: 0, y: 10 },
                                    visible: { opacity: 1, y: 0 },
                                }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                {renderMobileCard(item, index)}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>
            )}
        </div>
    );
}

export default ResponsiveTable;
