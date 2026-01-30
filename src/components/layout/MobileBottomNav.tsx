import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Home,
    ShoppingCart,
    DollarSign,
    Menu,
    LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileMenuSheet } from './MobileMenuSheet';
import { MobileAppsGrid } from './MobileAppsGrid';

interface NavItem {
    id: string;
    label: string;
    icon: React.ElementType;
    href?: string;
    action?: 'menu' | 'apps';
}

const NAV_ITEMS: NavItem[] = [
    { id: 'dashboard', label: 'Início', icon: Home, href: '/app/dashboard' },
    { id: 'vendas', label: 'Vendas', icon: ShoppingCart, href: '/app/vendas/pedidos' },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign, href: '/app/financeiro/tesouraria' },
    { id: 'menu', label: 'Mais', icon: Menu, action: 'menu' },
    { id: 'apps', label: 'Ícones', icon: LayoutGrid, action: 'apps' },
];

interface MobileBottomNavProps {
    className?: string;
    onOpenSettings?: () => void;
}

/**
 * Barra de navegação inferior para dispositivos móveis.
 * Estilo iOS/Android com 5 itens principais e menu completo via sheet.
 */
export function MobileBottomNav({ className, onOpenSettings }: MobileBottomNavProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAppsOpen, setIsAppsOpen] = useState(false);

    const isActive = (item: NavItem): boolean => {
        if (item.action) return false;
        if (!item.href) return false;

        // Dashboard é ativo apenas na rota exata
        if (item.href === '/app/dashboard') {
            return location.pathname === '/app/dashboard';
        }

        // Outros itens são ativos se a rota começa com o href
        return location.pathname.startsWith(item.href.replace('/pedidos', '').replace('/tesouraria', ''));
    };

    const handleItemClick = (item: NavItem) => {
        if (item.action === 'menu') {
            setIsMenuOpen(true);
        } else if (item.action === 'apps') {
            setIsAppsOpen(true);
        } else if (item.href) {
            navigate(item.href);
        }
    };

    return (
        <>
            <nav
                className={cn(
                    // Posição fixa no bottom
                    'fixed bottom-0 left-0 right-0 z-50',
                    // Glassmorphism
                    'bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl',
                    // Border e shadow
                    'border-t border-gray-200/50 dark:border-gray-700/50',
                    'shadow-[0_-4px_20px_rgba(0,0,0,0.08)]',
                    // Safe area para iPhone
                    'pb-[env(safe-area-inset-bottom)]',
                    className
                )}
                aria-label="Navegação principal"
            >
                <div className="flex items-center justify-around h-16">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item);

                        return (
                            <motion.button
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className={cn(
                                    // Layout
                                    'flex flex-col items-center justify-center',
                                    'min-w-[64px] min-h-[44px] px-3 py-1',
                                    // Transições
                                    'transition-colors duration-200',
                                    // Estados
                                    active
                                        ? 'text-primary'
                                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                )}
                                whileTap={{ scale: 0.95 }}
                                aria-current={active ? 'page' : undefined}
                                aria-label={item.label}
                            >
                                <Icon
                                    className={cn(
                                        'w-6 h-6 mb-0.5',
                                        active && 'text-primary'
                                    )}
                                    strokeWidth={active ? 2.5 : 2}
                                />
                                <span
                                    className={cn(
                                        'text-[10px] font-medium leading-tight',
                                        active && 'font-semibold'
                                    )}
                                >
                                    {item.label}
                                </span>

                                {/* Indicador de ativo */}
                                {active && (
                                    <motion.div
                                        layoutId="bottomNavIndicator"
                                        className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full"
                                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                    />
                                )}
                            </motion.button>
                        );
                    })}
                </div>
            </nav>

            {/* Menu Lista (Sheet) */}
            <MobileMenuSheet
                open={isMenuOpen}
                onOpenChange={setIsMenuOpen}
                onNavigate={(href: string) => {
                    navigate(href);
                    setIsMenuOpen(false);
                }}
            />

            {/* Menu Grade (Springboard) */}
            <MobileAppsGrid
                open={isAppsOpen}
                onOpenChange={setIsAppsOpen}
                onNavigate={(href: string) => {
                    navigate(href);
                    setIsAppsOpen(false);
                }}
            />
        </>
    );
}

export default MobileBottomNav;
