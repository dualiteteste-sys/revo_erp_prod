import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

type ConfirmVariant = 'primary' | 'danger' | 'warning';

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleCancel = useCallback(() => {
    close();
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, [close]);

  const handleConfirm = useCallback(() => {
    close();
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, [close]);

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmationModal
        isOpen={open}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title={options?.title ?? 'Confirmar'}
        description={options?.description ?? ''}
        confirmText={options?.confirmText}
        cancelText={options?.cancelText}
        isLoading={false}
        variant={options?.variant ?? 'primary'}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
