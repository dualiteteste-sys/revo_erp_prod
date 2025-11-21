import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { EmpresaUser, UserRole } from './types';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2 } from 'lucide-react';
import { updateUserRole, deactivateUser, reactivateUser } from '@/services/users';
import DangerZoneUser from './DangerZoneUser';

type Props = {
  open: boolean;
  user?: EmpresaUser | null;
  onClose: () => void;
  onUpdate: () => void;
};

const roleOptions: { value: UserRole, label: string }[] = [
  { value: 'OWNER', label: 'Proprietário' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'FINANCE', label: 'Financeiro' },
  { value: 'OPS', label: 'Operações' },
  { value: 'READONLY', label: 'Somente Leitura' },
];

export function EditUserRoleDrawer({ open, user, onClose, onUpdate }: Props) {
  const [role, setRole] = useState<UserRole>('READONLY');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (user) setRole(user.role);
  }, [user]);

  if (!user) return null;

  const isOwner = user.role === 'OWNER';

  const handleSave = async () => {
    if (role === user.role) {
      onClose();
      return;
    }
    setLoading(true);

    try {
      await updateUserRole(user.user_id, role);
      addToast('Papel do usuário atualizado.', 'success');
      onUpdate();
      onClose();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeactivate = async () => {
    setLoading(true);
    try {
      await deactivateUser(user.user_id);
      addToast('Usuário desativado.', 'success');
      onUpdate();
      onClose();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleReactivate = async () => {
    setLoading(true);
    try {
      await reactivateUser(user.user_id);
      addToast('Usuário reativado.', 'success');
      onUpdate();
      onClose();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Gerenciar Usuário" size="2xl">
      <div className="p-6 space-y-6">
        <div>
          <p className="font-semibold text-lg">{user.name || user.email}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        
        <div className="space-y-2">
          <Select label="Papel do Usuário" value={role} onChange={e => setRole(e.target.value as UserRole)} disabled={isOwner}>
            {roleOptions.map(opt => (
              <option key={opt.value} value={opt.value} disabled={opt.value === 'OWNER'}>
                {opt.label}
              </option>
            ))}
          </Select>
          {isOwner && <p className="text-xs text-orange-600">O papel de Proprietário não pode ser alterado.</p>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading || role === user.role || isOwner}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Alterações
          </Button>
        </div>

        <DangerZoneUser
          user={user}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          onTransferOwner={() => addToast('Funcionalidade de transferência em desenvolvimento.', 'info')}
        />
      </div>
    </Modal>
  );
}
