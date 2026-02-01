import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Toast, { ToastProps } from '../components/ui/Toast';
import { SentryReportListener } from '@/components/error/SentryReportListener';
import { createPortal } from 'react-dom';
import { normalizeToastErrorMessage } from '@/lib/toastErrorNormalizer';

type ToastType = "success" | "error" | "warning" | "info";

export type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
  ariaLabel?: string;
};

export type ToastOptions = {
  title?: string;
  durationMs?: number;
  action?: ToastAction;
};

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  title?: string;
  durationMs: number;
  action?: ToastAction;
}

interface ToastContextType {
  addToast: (message: string, type: ToastType, titleOrOptions?: string | ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  // In unit tests we don't need real toasts/animations and they can keep the
  // process alive (timers / rAF via framer-motion). Use a no-op provider.
  // IMPORTANT: this file is imported in the browser (Vite). Avoid `process.*`
  // which is undefined in browser builds and breaks E2E/production runtime.
  const IS_TEST_ENV =
    typeof import.meta !== 'undefined' &&
    typeof (import.meta as any).env !== 'undefined' &&
    (((import.meta as any).env.MODE as string | undefined) === 'test' || Boolean((import.meta as any).env.VITEST));

  if (IS_TEST_ENV) {
    const addToast = () => {};
    return <ToastContext.Provider value={{ addToast }}>{children}</ToastContext.Provider>;
  }

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);
  const timeoutsRef = useRef<Map<number, number>>(new Map());

  // Prevent dangling timeouts (can hang Vitest/CI).
  useEffect(() => {
    return () => {
      for (const t of timeoutsRef.current.values()) {
        window.clearTimeout(t);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  const removeToast = useCallback((id: number) => {
    const t = timeoutsRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timeoutsRef.current.delete(id);
    }
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType, titleOrOptions?: string | ToastOptions) => {
    const id = toastId.current++;
    const options: ToastOptions =
      typeof titleOrOptions === 'string'
        ? { title: titleOrOptions }
        : (titleOrOptions ?? {});

    let finalMessage = message;
    let finalTitle = options.title;
    if (type === 'error') {
      const normalized = normalizeToastErrorMessage({ message, title: options.title });
      finalMessage = normalized.message;
      finalTitle = normalized.title ?? finalTitle;
    }

    const durationMs = typeof options.durationMs === 'number' ? options.durationMs : 5000;
    setToasts((prevToasts) => [...prevToasts, { id, message: finalMessage, type, title: finalTitle, durationMs, action: options.action }]);

    const t = window.setTimeout(() => {
      removeToast(id);
    }, durationMs);
    timeoutsRef.current.set(id, t);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <SentryReportListener />
      {typeof document !== 'undefined'
        ? createPortal(
          <div className="fixed top-5 right-5 z-[9999] space-y-3">
            <AnimatePresence>
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  layout
                  initial={{ opacity: 0, y: -20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 50, scale: 0.9 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  <Toast
                    type={toast.type}
                    title={toast.title}
                    message={toast.message}
                    actionLabel={toast.action?.label}
                    actionAriaLabel={toast.action?.ariaLabel}
                    onAction={toast.action ? async () => {
                      try {
                        await toast.action.onClick();
                      } finally {
                        removeToast(toast.id);
                      }
                    } : undefined}
                    onClose={() => removeToast(toast.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )
        : null}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
