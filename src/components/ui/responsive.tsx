import React from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface ResponsiveProps {
    children: React.ReactNode;
    /** Classes extras para o wrapper (quando renderizado) */
    className?: string;
}

/**
 * Renderiza children apenas em dispositivos mobile (< 768px)
 */
export function ShowOnMobile({ children, className }: ResponsiveProps) {
    const { isMobile } = useBreakpoint();
    if (!isMobile) return null;
    return className ? <div className={className}>{children}</div> : <>{children}</>;
}

/**
 * Esconde children em dispositivos mobile (< 768px)
 */
export function HideOnMobile({ children, className }: ResponsiveProps) {
    const { isMobile } = useBreakpoint();
    if (isMobile) return null;
    return className ? <div className={className}>{children}</div> : <>{children}</>;
}

/**
 * Renderiza children apenas em tablets (768px - 1023px)
 */
export function ShowOnTablet({ children, className }: ResponsiveProps) {
    const { isTablet } = useBreakpoint();
    if (!isTablet) return null;
    return className ? <div className={className}>{children}</div> : <>{children}</>;
}

/**
 * Esconde children em tablets (768px - 1023px)
 */
export function HideOnTablet({ children, className }: ResponsiveProps) {
    const { isTablet } = useBreakpoint();
    if (isTablet) return null;
    return className ? <div className={className}>{children}</div> : <>{children}</>;
}

/**
 * Renderiza children apenas em desktop (>= 1024px)
 */
export function ShowOnDesktop({ children, className }: ResponsiveProps) {
    const { isDesktop } = useBreakpoint();
    if (!isDesktop) return null;
    return className ? <div className={className}>{children}</div> : <>{children}</>;
}

/**
 * Esconde children em desktop (>= 1024px)
 */
export function HideOnDesktop({ children, className }: ResponsiveProps) {
    const { isDesktop } = useBreakpoint();
    if (isDesktop) return null;
    return className ? <div className={className}>{children}</div> : <>{children}</>;
}

interface ResponsiveValueProps<T> {
    /** Valores para cada tipo de dispositivo */
    value: {
        mobile?: T;
        tablet?: T;
        desktop?: T;
    };
    /** Função que renderiza o valor */
    children: (value: T) => React.ReactNode;
}

/**
 * Renderiza diferentes valores baseados no tipo de dispositivo
 * 
 * @example
 * ```tsx
 * <ResponsiveValue value={{ mobile: 1, tablet: 2, desktop: 4 }}>
 *   {(columns) => <Grid columns={columns} />}
 * </ResponsiveValue>
 * ```
 */
export function ResponsiveValue<T>({ value, children }: ResponsiveValueProps<T>) {
    const { isMobile, isTablet } = useBreakpoint();

    let currentValue: T | undefined;
    if (isMobile) {
        currentValue = value.mobile ?? value.tablet ?? value.desktop;
    } else if (isTablet) {
        currentValue = value.tablet ?? value.desktop ?? value.mobile;
    } else {
        currentValue = value.desktop ?? value.tablet ?? value.mobile;
    }

    if (currentValue === undefined) return null;
    return <>{children(currentValue)}</>;
}

/**
 * Componente que aplica diferentes classes CSS baseado no breakpoint.
 * Útil para casos onde você precisa de padding/margin diferentes.
 */
interface ResponsiveContainerProps {
    children: React.ReactNode;
    /** Classes para mobile (< 768px) */
    mobileClassName?: string;
    /** Classes para tablet (768px - 1023px) */
    tabletClassName?: string;
    /** Classes para desktop (>= 1024px) */
    desktopClassName?: string;
    /** Classes que sempre são aplicadas */
    className?: string;
    /** Tag HTML a usar (default: div) */
    as?: keyof JSX.IntrinsicElements;
}

export function ResponsiveContainer({
    children,
    mobileClassName = '',
    tabletClassName = '',
    desktopClassName = '',
    className = '',
    as: Component = 'div',
}: ResponsiveContainerProps) {
    const { isMobile, isTablet, isDesktop } = useBreakpoint();

    const responsiveClass = isMobile
        ? mobileClassName
        : isTablet
            ? tabletClassName
            : isDesktop
                ? desktopClassName
                : '';

    const Tag = Component as React.ElementType;

    return (
        <Tag className={`${className} ${responsiveClass}`.trim()}>
            {children}
        </Tag>
    );
}

export default {
    ShowOnMobile,
    HideOnMobile,
    ShowOnTablet,
    HideOnTablet,
    ShowOnDesktop,
    HideOnDesktop,
    ResponsiveValue,
    ResponsiveContainer,
};
