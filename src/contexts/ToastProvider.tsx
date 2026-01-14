import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Toast, { ToastProps } from '../components/ui/Toast';
import { SentryReportListener } from '@/components/error/SentryReportListener';

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
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);
  const timeoutsRef = useRef<Map<number, number>>(new Map());

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

    const durationMs = typeof options.durationMs === 'number' ? options.durationMs : 5000;
    setToasts((prevToasts) => [...prevToasts, { id, message, type, title: options.title, durationMs, action: options.action }]);

    const t = window.setTimeout(() => {
      removeToast(id);
    }, durationMs);
    timeoutsRef.current.set(id, t);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <SentryReportListener />
      <div className="fixed top-5 right-5 z-50 space-y-3">
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
      </div>
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
