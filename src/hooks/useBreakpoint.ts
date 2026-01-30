import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Breakpoints alinhados com Tailwind CSS defaults
 */
const BREAKPOINTS = {
    xs: 475,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

const BREAKPOINT_ORDER: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

/**
 * Determina o breakpoint atual baseado na largura da janela
 */
function getBreakpoint(width: number): Breakpoint {
    if (width < BREAKPOINTS.xs) return 'xs';
    if (width < BREAKPOINTS.sm) return 'sm';
    if (width < BREAKPOINTS.md) return 'md';
    if (width < BREAKPOINTS.lg) return 'lg';
    if (width < BREAKPOINTS.xl) return 'xl';
    return '2xl';
}

/**
 * Hook para detectar o breakpoint atual e utilitários de responsividade.
 * 
 * @example
 * ```tsx
 * const { isMobile, isTablet, isDesktop, breakpoint } = useBreakpoint();
 * 
 * if (isMobile) {
 *   return <MobileLayout />;
 * }
 * ```
 */
export function useBreakpoint() {
    const [width, setWidth] = useState(() => {
        if (typeof window === 'undefined') return 1024; // SSR: assume desktop
        return window.innerWidth;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleResize = () => {
            setWidth(window.innerWidth);
        };

        // Throttle resize events para performance
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const throttledResize = () => {
            if (timeoutId) return;
            timeoutId = setTimeout(() => {
                handleResize();
                timeoutId = null;
            }, 100);
        };

        window.addEventListener('resize', throttledResize);

        // Set initial value
        handleResize();

        return () => {
            window.removeEventListener('resize', throttledResize);
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, []);

    const breakpoint = useMemo(() => getBreakpoint(width), [width]);

    const isMobile = width < BREAKPOINTS.md;
    const isTablet = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
    const isDesktop = width >= BREAKPOINTS.lg;

    /**
     * Verifica se a largura atual está ABAIXO do breakpoint especificado
     */
    const isBelow = useCallback(
        (bp: Breakpoint) => width < BREAKPOINTS[bp],
        [width]
    );

    /**
     * Verifica se a largura atual está ACIMA OU IGUAL ao breakpoint especificado
     */
    const isAbove = useCallback(
        (bp: Breakpoint) => width >= BREAKPOINTS[bp],
        [width]
    );

    /**
     * Retorna um valor baseado no breakpoint atual
     * @example
     * const columns = match({ xs: 1, sm: 2, md: 3, lg: 4 });
     */
    const match = useCallback(
        <T,>(values: Partial<Record<Breakpoint, T>>): T | undefined => {
            // Encontra o valor mais próximo (igual ou menor) do breakpoint atual
            const currentIndex = BREAKPOINT_ORDER.indexOf(breakpoint);
            for (let i = currentIndex; i >= 0; i--) {
                const bp = BREAKPOINT_ORDER[i];
                if (values[bp] !== undefined) {
                    return values[bp];
                }
            }
            return undefined;
        },
        [breakpoint]
    );

    return {
        /** Breakpoint atual: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' */
        breakpoint,
        /** Largura da janela em pixels */
        width,
        /** true se < 768px (phones) */
        isMobile,
        /** true se >= 768px e < 1024px (tablets) */
        isTablet,
        /** true se >= 1024px (laptops/desktops) */
        isDesktop,
        /** Função: verifica se está abaixo de um breakpoint */
        isBelow,
        /** Função: verifica se está acima ou igual a um breakpoint */
        isAbove,
        /** Função: retorna valor baseado no breakpoint atual */
        match,
        /** Constantes de breakpoints em pixels */
        BREAKPOINTS,
    };
}

export default useBreakpoint;
