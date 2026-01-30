import { useState, useEffect } from 'react';

/**
 * Hook simplificado para detectar se o dispositivo é mobile (< 768px).
 * 
 * Use este hook quando você só precisa de um boolean simples para mobile.
 * Para mais controle, use `useBreakpoint` ao invés.
 * 
 * @example
 * ```tsx
 * const isMobile = useIsMobile();
 * 
 * return isMobile ? <MobileView /> : <DesktopView />;
 * ```
 */
export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false; // SSR: assume desktop
        return window.innerWidth < 768;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Usar matchMedia é mais performático que resize listener
        const mediaQuery = window.matchMedia('(max-width: 767px)');

        const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
            setIsMobile(e.matches);
        };

        // Set initial value
        handleChange(mediaQuery);

        // Modern browsers
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }

        // Legacy browsers (Safari < 14)
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }, []);

    return isMobile;
}

export default useIsMobile;
