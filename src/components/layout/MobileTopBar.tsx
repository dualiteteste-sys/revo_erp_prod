import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Search, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuConfig } from '@/config/menuConfig';

interface MobileTopBarProps {
    className?: string;
    onOpenSearch?: () => void;
    onOpenNotifications?: () => void;
}

/**
 * Encontra o título da página atual baseado na rota
 */
function usePageTitle(): { title: string; canGoBack: boolean } {
    const location = useLocation();
    const pathname = location.pathname;

    return useMemo(() => {
        // Dashboard não tem voltar
        if (pathname === '/app/dashboard' || pathname === '/app') {
            return { title: 'Dashboard', canGoBack: false };
        }

        // Procura nos menus
        for (const group of menuConfig) {
            if (group.children) {
                for (const child of group.children) {
                    if (pathname.startsWith(child.href) && child.href !== '#') {
                        return { title: child.name, canGoBack: true };
                    }
                }
            }
            if (pathname.startsWith(group.href) && group.href !== '#') {
                return { title: group.name, canGoBack: false };
            }
        }

        // Fallback para título baseado no path
        const segments = pathname.split('/').filter(Boolean);
        const lastSegment = segments[segments.length - 1] || 'Dashboard';
        const title = lastSegment
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase());

        return { title, canGoBack: segments.length > 2 };
    }, [pathname]);
}

/**
 * Header mobile com título da página, botão voltar e ações.
 */
export function MobileTopBar({
    className,
    onOpenSearch,
    onOpenNotifications,
}: MobileTopBarProps) {
    const navigate = useNavigate();
    const { title, canGoBack } = usePageTitle();

    const handleBack = () => {
        navigate(-1);
    };

    return (
        <header
            className={cn(
                // Layout
                'sticky top-0 left-0 right-0 z-40',
                // Glassmorphism
                'bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl',
                // Border e shadow
                'border-b border-gray-200/50 dark:border-gray-700/50',
                // Safe area para iPhone (notch)
                'pt-[env(safe-area-inset-top)]',
                className
            )}
        >
            <div className="flex items-center justify-between h-14 px-4">
                {/* Lado esquerdo: Voltar */}
                <div className="w-10">
                    {canGoBack && (
                        <motion.button
                            onClick={handleBack}
                            className={cn(
                                'flex items-center justify-center',
                                'w-10 h-10 -ml-2',
                                'text-gray-600 dark:text-gray-300',
                                'hover:bg-gray-100 dark:hover:bg-gray-800',
                                'rounded-full transition-colors'
                            )}
                            whileTap={{ scale: 0.95 }}
                            aria-label="Voltar"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </motion.button>
                    )}
                </div>

                {/* Centro: Título */}
                <motion.h1
                    key={title}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[200px]"
                >
                    {title}
                </motion.h1>

                {/* Lado direito: Ações */}
                <div className="flex items-center gap-1">
                    {onOpenSearch && (
                        <motion.button
                            onClick={onOpenSearch}
                            className={cn(
                                'flex items-center justify-center',
                                'w-10 h-10',
                                'text-gray-600 dark:text-gray-300',
                                'hover:bg-gray-100 dark:hover:bg-gray-800',
                                'rounded-full transition-colors'
                            )}
                            whileTap={{ scale: 0.95 }}
                            aria-label="Buscar"
                        >
                            <Search className="w-5 h-5" />
                        </motion.button>
                    )}
                    {onOpenNotifications && (
                        <motion.button
                            onClick={onOpenNotifications}
                            className={cn(
                                'flex items-center justify-center',
                                'w-10 h-10',
                                'text-gray-600 dark:text-gray-300',
                                'hover:bg-gray-100 dark:hover:bg-gray-800',
                                'rounded-full transition-colors relative'
                            )}
                            whileTap={{ scale: 0.95 }}
                            aria-label="Notificações"
                        >
                            <Bell className="w-5 h-5" />
                            {/* Badge de notificação (exemplo) */}
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
                        </motion.button>
                    )}
                </div>
            </div>
        </header>
    );
}

export default MobileTopBar;
