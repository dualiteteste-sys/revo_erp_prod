import React from 'react';
import Modal from '@/components/ui/Modal';
import OsKanbanBoard from './OsKanbanBoard';

interface OsKanbanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const OsKanbanModal: React.FC<OsKanbanModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agenda de Ordens de Serviço" size="7xl">
      <div className="p-4 h-full">
        <OsKanbanBoard />
      </div>
    </Modal>
  );
};

export default OsKanbanModal;
