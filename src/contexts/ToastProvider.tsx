import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Toast, { ToastProps } from '../components/ui/Toast';

type ToastType = "success" | "error" | "warning" | "info";

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  title?: string;
}

interface ToastContextType {
  addToast: (message: string, type: ToastType, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType, title?: string) => {
    const id = toastId.current++;
    setToasts((prevToasts) => [...prevToasts, { id, message, type, title }]);

    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
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
