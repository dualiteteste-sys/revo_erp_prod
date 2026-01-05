import React, { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import GlassCard from './GlassCard';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full' | '60pct' | '70pct' | '80pct' | '90pct';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
  size?: ModalSize;
  containerClassName?: string;
  overlayClassName?: string;
  headerClassName?: string;
  titleClassName?: string;
  bodyClassName?: string;
  glassClassName?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  'full': 'max-w-[98vw]',
  '60pct': 'max-w-[60vw]',
  '70pct': 'max-w-[70vw]',
  '80pct': 'max-w-[80vw]',
  '90pct': 'max-w-[90vw]',
};

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  title,
  size = '7xl',
  containerClassName,
  overlayClassName,
  headerClassName,
  titleClassName,
  bodyClassName,
  glassClassName,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const ariaLabel = useMemo(() => (typeof title === 'string' ? title : 'Modal'), [title]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const t = window.setTimeout(() => {
      const focusables = getFocusableElements(dialogRef.current);
      if (focusables.length > 0) {
        focusables[0].focus();
        return;
      }
      closeBtnRef.current?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;
      const focusables = getFocusableElements(dialogRef.current);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first) {
          e.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
      previouslyFocused.current = null;
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            'fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-md',
            overlayClassName,
          )}
          onMouseDown={(e) => {
            // clique no backdrop fecha (sem fechar ao clicar dentro do modal)
            if (e.target === overlayRef.current) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cn(
              'w-full max-h-[95vh] flex flex-col relative',
              sizeClasses[size],
              containerClassName,
            )}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            ref={dialogRef}
          >
            <GlassCard className={cn('h-full flex flex-col overflow-hidden', glassClassName)}>
              <header className={cn('flex-shrink-0 px-6 py-5 flex justify-between items-center border-b border-white/20', headerClassName)}>
                <h2 className={cn('text-lg md:text-xl font-bold text-gray-900', titleClassName)}>{title}</h2>
                <button
                  ref={closeBtnRef}
                  onClick={onClose}
                  className="text-gray-600 hover:text-gray-900 z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-full p-2 hover:bg-white/40 active:bg-white/50 transition"
                  aria-label="Fechar modal"
                >
                  <X size={24} />
                </button>
              </header>
              <div className={cn('flex-grow overflow-y-auto scrollbar-styled', bodyClassName)}>
                {children}
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
