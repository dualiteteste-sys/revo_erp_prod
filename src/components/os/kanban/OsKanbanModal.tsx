import React from 'react';
import Modal from '@/components/ui/Modal';
import OsKanbanBoard from './OsKanbanBoard';
import { useNavigate } from 'react-router-dom';

interface OsKanbanModalProps {
  isOpen: boolean;
  onClose: () => void;
  canUpdate?: boolean;
}

const OsKanbanModal: React.FC<OsKanbanModalProps> = ({ isOpen, onClose, canUpdate = true }) => {
  const navigate = useNavigate();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agenda de Ordens de Serviço" size="7xl">
      <div className="p-4 h-full">
        <OsKanbanBoard
          canUpdate={canUpdate}
          onOpenOs={(osId) => {
            onClose();
            navigate(`/app/ordens-de-servico?osId=${encodeURIComponent(osId)}`);
          }}
        />
      </div>
    </Modal>
  );
};

export default OsKanbanModal;
