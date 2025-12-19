import React from 'react';
import Modal from '@/components/ui/Modal';
import NfeInputPage from '@/pages/tools/NfeInputPage';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onFinished?: (params: { recebimentoId: string }) => void;
};

export default function ImportarXmlSuprimentosModal({ isOpen, onClose, onFinished }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar XML (NF-e)" size="90pct">
      <div className="p-4">
        <NfeInputPage
          embedded
          autoFinalizeMaterialCliente
          onRecebimentoReady={({ recebimentoId }) => {
            onClose();
            onFinished?.({ recebimentoId });
          }}
        />
      </div>
    </Modal>
  );
}
