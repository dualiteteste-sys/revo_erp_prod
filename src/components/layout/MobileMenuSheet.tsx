import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuConfig, MenuItem } from '@/config/menuConfig';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';

interface MobileMenuSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onNavigate: (href: string) => void;
}

/**
 * Menu completo em sheet para navegação mobile.
 * Slide-up from bottom com busca e navegação por categorias.
 */
export function MobileMenuSheet({
    open,
    onOpenChange,
    onNavigate,
}: MobileMenuSheetProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Filtra itens de menu baseado na busca
    const filteredMenu = useMemo(() => {
        if (!searchQuery.trim()) return menuConfig;

        const query = searchQuery.toLowerCase();
        return menuConfig
            .map((group) => {
                // Se o grupo tem filhos, filtra os filhos
                if (group.children) {
                    const filteredChildren = group.children.filter(
                        (child) =>
                            child.name.toLowerCase().includes(query) ||
                            child.href.toLowerCase().includes(query)
                    );
                    if (filteredChildren.length > 0) {
                        return { ...group, children: filteredChildren };
                    }
                    // Se o nome do grupo bate, retorna tudo
                    if (group.name.toLowerCase().includes(query)) {
                        return group;
                    }
                    return null;
                }
                // Item simples
                if (
                    group.name.toLowerCase().includes(query) ||
                    group.href.toLowerCase().includes(query)
                ) {
                    return group;
                }
                return null;
            })
            .filter(Boolean) as MenuItem[];
    }, [searchQuery]);

    const toggleGroup = (groupName: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupName)) {
                next.delete(groupName);
            } else {
                next.add(groupName);
            }
            return next;
        });
    };

    const handleItemClick = (item: MenuItem) => {
        if (item.href && item.href !== '#') {
            onNavigate(item.href);
        } else if (item.children) {
            toggleGroup(item.name);
        }
    };

    const handleChildClick = (href: string) => {
        if (href && href !== '#') {
            onNavigate(href);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className={cn(
                    // Altura máxima
                    'h-[85vh] rounded-t-3xl',
                    // Padding customizado
                    'p-0',
                    // Safe area
                    'pb-[env(safe-area-inset-bottom)]'
                )}
            >
                {/* Header com busca */}
                <SheetHeader className="p-4 pb-0">
                    <div className="flex items-center justify-between mb-4">
                        <SheetTitle className="text-lg font-semibold">Menu</SheetTitle>
                    </div>

                    {/* Campo de busca */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={cn(
                                'w-full pl-10 pr-4 py-3',
                                'bg-gray-100 dark:bg-gray-800',
                                'border-0 rounded-xl',
                                'text-sm placeholder:text-gray-400',
                                'focus:outline-none focus:ring-2 focus:ring-primary/50'
                            )}
                        />
                    </div>
                </SheetHeader>

                {/* Lista de itens */}
                <div className="overflow-y-auto h-[calc(85vh-130px)] px-4 py-4">
                    <div className="space-y-1">
                        {filteredMenu.map((item) => {
                            // Pula item "Sair" no menu mobile (vai estar no perfil)
                            if (item.name === 'Sair') return null;

                            const Icon = item.icon;
                            const isExpanded = expandedGroups.has(item.name);
                            const hasChildren = item.children && item.children.length > 0;

                            return (
                                <div key={item.name}>
                                    {/* Item principal */}
                                    <motion.button
                                        onClick={() => handleItemClick(item)}
                                        className={cn(
                                            'flex items-center w-full px-3 py-3',
                                            'rounded-xl transition-colors',
                                            'hover:bg-gray-100 dark:hover:bg-gray-800',
                                            'active:bg-gray-200 dark:active:bg-gray-700', // Feedback de toque mais forte
                                            'text-left group'
                                        )}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        {/* Ícone com gradiente */}
                                        <div
                                            className={cn(
                                                'flex items-center justify-center',
                                                'w-10 h-10 rounded-xl mr-3',
                                                'bg-gradient-to-br shadow-sm',
                                                item.gradient || 'from-gray-400 to-gray-500'
                                            )}
                                        >
                                            <Icon className="w-5 h-5 text-white" strokeWidth={2} />
                                        </div>

                                        {/* Nome */}
                                        <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">
                                            {item.name}
                                        </span>

                                        {/* Chevron se tem filhos */}
                                        {hasChildren && (
                                            <motion.div
                                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <ChevronRight className="w-5 h-5 text-gray-400" />
                                            </motion.div>
                                        )}
                                    </motion.button>

                                    {/* Filhos expandidos */}
                                    <AnimatePresence>
                                        {hasChildren && isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="pl-14 py-1 space-y-1">
                                                    {item.children!.map((child) => {
                                                        const ChildIcon = child.icon;
                                                        return (
                                                            <motion.button
                                                                key={child.href}
                                                                onClick={() => handleChildClick(child.href)}
                                                                className={cn(
                                                                    'flex items-center w-full px-3 py-2.5',
                                                                    'rounded-lg transition-colors',
                                                                    'hover:bg-gray-100 dark:hover:bg-gray-800',
                                                                    'active:bg-gray-200 dark:active:bg-gray-700',
                                                                    'text-left'
                                                                )}
                                                                whileTap={{ scale: 0.98 }}
                                                            >
                                                                <ChildIcon className="w-4 h-4 mr-3 text-gray-500" />
                                                                <span className="text-sm text-gray-600 dark:text-gray-300">
                                                                    {child.name}
                                                                </span>
                                                            </motion.button>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>

                    {/* Mensagem quando busca não encontra nada */}
                    {filteredMenu.length === 0 && searchQuery && (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                            <Search className="w-12 h-12 mb-4 opacity-50" />
                            <p className="text-sm">Nenhum resultado para "{searchQuery}"</p>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default MobileMenuSheet;
