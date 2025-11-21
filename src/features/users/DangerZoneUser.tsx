import React, { useState } from 'react';
import { EmpresaUser } from './types';
import { Button } from '@/components/ui/button';
import { AlertTriangle, UserCog, UserCheck, UserX } from 'lucide-react';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useCan } from '@/hooks/useCan';

type Props = {
  user: EmpresaUser;
  onDeactivate: () => void;
  onReactivate: () => void;
  onTransferOwner: (toUserId: string) => void;
};

export default function DangerZoneUser({ user, onDeactivate, onReactivate, onTransferOwner }: Props) {
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  
  const canManage = useCan('usuarios', 'manage');
  const isSelf = false; // Add logic to check if the user is editing themselves
  const isOwner = user.role === 'OWNER';

  if (!canManage || isSelf) return null;

  return (
    <div className="border-t border-red-200 pt-6 mt-6">
      <h3 className="text-lg font-semibold text-red-700 flex items-center gap-2">
        <AlertTriangle />
        Zona de Perigo
      </h3>
      <div className="mt-4 space-y-4">
        {user.status === 'ACTIVE' && !isOwner && (
          <div className="flex justify-between items-center p-4 border border-red-200 rounded-lg">
            <div>
              <p className="font-semibold">Desativar Usuário</p>
              <p className="text-sm text-gray-600">O usuário não poderá mais acessar esta empresa.</p>
            </div>
            <Button variant="destructive" onClick={() => setIsDeactivateModalOpen(true)}>
              <UserX className="mr-2 h-4 w-4" />
              Desativar
            </Button>
          </div>
        )}
        {user.status === 'INACTIVE' && (
          <div className="flex justify-between items-center p-4 border border-green-200 rounded-lg">
            <div>
              <p className="font-semibold">Reativar Usuário</p>
              <p className="text-sm text-gray-600">O usuário poderá acessar a empresa novamente.</p>
            </div>
            <Button variant="secondary" onClick={onReactivate} className="bg-green-100 text-green-800 hover:bg-green-200">
              <UserCheck className="mr-2 h-4 w-4" />
              Reativar
            </Button>
          </div>
        )}
        {isOwner && (
          <div className="flex justify-between items-center p-4 border border-red-200 rounded-lg">
            <div>
              <p className="font-semibold">Transferir Propriedade</p>
              <p className="text-sm text-gray-600">Esta ação é irreversível.</p>
            </div>
            <Button variant="destructive" onClick={() => setIsTransferModalOpen(true)} disabled>
              <UserCog className="mr-2 h-4 w-4" />
              Transferir
            </Button>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        onConfirm={onDeactivate}
        title="Desativar Usuário"
        description={`Tem certeza que deseja desativar ${user.email}?`}
        confirmText="Sim, desativar"
        variant="danger"
        isLoading={false}
      />
      {/* Transfer modal would be implemented here */}
    </div>
  );
}
