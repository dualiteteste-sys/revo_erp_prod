import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import TextArea from '@/components/ui/forms/TextArea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type MotivoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  confirmLabel: string;
  defaultMotivo?: string;
  isSubmitting?: boolean;
  onConfirm: (motivo: string) => Promise<void>;
};

export default function MotivoModal({
  isOpen,
  onClose,
  title,
  description,
  label = 'Motivo (opcional)',
  placeholder = 'Descreva o motivo...',
  confirmLabel,
  defaultMotivo = '',
  isSubmitting = false,
  onConfirm,
}: MotivoModalProps) {
  const [motivo, setMotivo] = useState(defaultMotivo);

  useEffect(() => {
    if (!isOpen) return;
    setMotivo(defaultMotivo || '');
  }, [defaultMotivo, isOpen]);

  const canSubmit = useMemo(() => {
    return !isSubmitting;
  }, [isSubmitting]);

  const handleConfirm = async () => {
    await onConfirm(motivo);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="2xl">
      <div className="p-6 space-y-4">
        {description ? <div className="text-sm text-gray-600">{description}</div> : null}
        <TextArea
          label={label}
          name="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={4}
          placeholder={placeholder}
        />
      </div>

      <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} disabled={!canSubmit} className="gap-2">
          {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

