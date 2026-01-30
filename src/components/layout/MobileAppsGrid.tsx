import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuConfig, MenuItem } from '@/config/menuConfig';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';

interface MobileAppsGridProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onNavigate: (href: string) => void;
}

export function MobileAppsGrid({
    open,
    onOpenChange,
    onNavigate,
}: MobileAppsGridProps) {
    const [activeFolder, setActiveFolder] = useState<MenuItem | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const handleItemClick = (item: MenuItem) => {
        if (item.children && item.children.length > 0) {
            setActiveFolder(item);
        } else if (item.href && item.href !== '#') {
            onNavigate(item.href);
            onOpenChange(false);
            setActiveFolder(null); // Reset ao fechar
        }
    };

    const handleBack = () => {
        setActiveFolder(null);
    };

    const currentItems = activeFolder ? activeFolder.children || [] : menuConfig;
    const title = activeFolder ? activeFolder.name : 'Aplicativos';

    // Filtro de busca (apenas no nível raiz por enquanto ou global?)
    // Se tiver busca, melhor mostrar lista plana ou filtrar grid.
    // Para simplificar "estilo iPhone", sem busca no grid por padrão, ou busca filtra e mostra lista.
    // Vamos manter simples: Grid puro.

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="h-[92vh] rounded-t-[32px] p-0 border-0 bg-gray-50 dark:bg-slate-950 flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-2">
                    {activeFolder ? (
                        <button
                            onClick={handleBack}
                            className="p-2 -ml-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors"
                        >
                            <ChevronLeft className="w-6 h-6 text-slate-800 dark:text-white" />
                        </button>
                    ) : (
                        <div className="w-10" /> // Spacer
                    )}

                    <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        {title}
                    </span>

                    <button
                        onClick={() => onOpenChange(false)}
                        className="p-2 -mr-2 rounded-full bg-gray-200/50 dark:bg-slate-800/50 hover:bg-gray-300 dark:hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                </div>

                {/* Grid Content */}
                <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={activeFolder ? activeFolder.name : 'root'}
                            initial={{ opacity: 0, scale: 0.95, x: activeFolder ? 20 : -20 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95, x: activeFolder ? 20 : -20 }}
                            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                            className="grid grid-cols-4 gap-y-8 gap-x-4"
                        >
                            {currentItems.map((item, index) => {
                                const Icon = item.icon;
                                // Se for nível 2 (children), item é diferente.
                                // O menuConfig define children com cores? Não, herda ou padrão.
                                // Vamos usar a cor do pai se for filho, ou cinza.
                                const gradient = activeFolder?.gradient || (item as MenuItem).gradient || 'from-slate-500 to-slate-600';

                                return (
                                    <motion.button
                                        key={item.name + index} // index fallback
                                        onClick={() => handleItemClick(item as MenuItem)}
                                        className="flex flex-col items-center gap-2 group"
                                        whileTap={{ scale: 0.9 }}
                                    >
                                        <div className={cn(
                                            "w-[68px] h-[68px] rounded-[18px] flex items-center justify-center shadow-lg shadow-gray-200/50 dark:shadow-none",
                                            "bg-gradient-to-br",
                                            gradient
                                        )}>
                                            <Icon className="w-8 h-8 text-white stroke-[1.5]" />
                                        </div>
                                        <span className={cn(
                                            "text-[11px] font-medium text-center leading-tight line-clamp-2 w-full px-1",
                                            "text-slate-600 dark:text-slate-300 group-active:text-slate-900 dark:group-active:text-white"
                                        )}>
                                            {item.name}
                                        </span>
                                    </motion.button>
                                );
                            })}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Visual Indicator (Dots) se houver paginação futura - Opcional */}
                <div className="h-8 flex items-center justify-center pb-8">
                    {!activeFolder && (
                        <div className="flex gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-800 dark:bg-white" />
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
