import React from 'react';
import { MoreHorizontal, UserX, UserCheck, Trash2, Edit, Send } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmpresaUser } from '../types';
import { useDeactivateUser, useReactivateUser, useDeleteInvite, useResendInvite } from '../hooks/useUsersQuery';

type UserActionsMenuProps = {
  user: EmpresaUser;
  onEdit: () => void;
};

const UserActionsMenu: React.FC<UserActionsMenuProps> = ({ user, onEdit }) => {
  const deactivateUserMutation = useDeactivateUser();
  const reactivateUserMutation = useReactivateUser();
  const deleteInviteMutation = useDeleteInvite();
  const resendInviteMutation = useResendInvite();

  const isMutating =
    deactivateUserMutation.isPending ||
    reactivateUserMutation.isPending ||
    deleteInviteMutation.isPending ||
    resendInviteMutation.isPending;

  const renderActions = () => {
    switch (user.status) {
      case 'PENDING':
        return (
          <>
            <DropdownMenuItem
              onClick={() => user.email && resendInviteMutation.mutate(user.email)}
              disabled={isMutating || !user.email}
            >
              <Send className="mr-2 h-4 w-4" />
              Reenviar Convite
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => deleteInviteMutation.mutate(user.user_id)}
              disabled={isMutating}
              className="text-red-600 focus:bg-red-50 focus:text-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir Convite
            </DropdownMenuItem>
          </>
        );
      case 'ACTIVE':
        return (
          <>
            <DropdownMenuItem onClick={onEdit} disabled={isMutating}>
              <Edit className="mr-2 h-4 w-4" />
              Editar Papel
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => deactivateUserMutation.mutate(user.user_id)}
              disabled={isMutating}
              className="text-red-600 focus:bg-red-50 focus:text-red-700"
            >
              <UserX className="mr-2 h-4 w-4" />
              Desativar Usuário
            </DropdownMenuItem>
          </>
        );
      case 'SUSPENDED':
      case 'INACTIVE':
        return (
          <DropdownMenuItem
            onClick={() => reactivateUserMutation.mutate(user.user_id)}
            disabled={isMutating}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            Reativar Usuário
          </DropdownMenuItem>
        );
      default:
        return null;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-2 rounded-md hover:bg-gray-100" disabled={isMutating}>
          <MoreHorizontal className="h-5 w-5 text-gray-500" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {renderActions()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserActionsMenu;
