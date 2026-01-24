import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  widthClassName?: string;
};

export default function SideSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  widthClassName,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[100000]">
          <motion.button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-black/30 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.aside
            className={[
              'absolute right-0 top-0 h-full',
              'bg-white/85 backdrop-blur-xl',
              'border-l border-white/30 shadow-2xl',
              'flex flex-col',
              widthClassName || 'w-[min(980px,92vw)]',
            ].join(' ')}
            initial={{ x: 24, opacity: 0, scale: 0.99 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 24, opacity: 0, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-5 border-b border-gray-200/70 flex items-start justify-between gap-4">
              <div className="min-w-0">
                {title ? <div className="text-lg font-bold text-gray-900 truncate">{title}</div> : null}
                {description ? <div className="text-sm text-gray-600 mt-0.5">{description}</div> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-blue-50 active:bg-blue-100 transition"
                aria-label="Fechar"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">{children}</div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

