import React from 'react';
import { MoreHorizontal, UserX, UserCheck, Trash2, Edit, Send, Copy } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmpresaUser } from '../types';
import { useDeactivateUser, useReactivateUser, useDeleteInvite, useResendInvite } from '../hooks/useUsersQuery';
import { resendInvite } from '@/services/users';
import { useToast } from '@/contexts/ToastProvider';

type UserActionsMenuProps = {
  user: EmpresaUser;
  onEdit: () => void;
};

const UserActionsMenu: React.FC<UserActionsMenuProps> = ({ user, onEdit }) => {
  const deactivateUserMutation = useDeactivateUser();
  const reactivateUserMutation = useReactivateUser();
  const deleteInviteMutation = useDeleteInvite();
  const resendInviteMutation = useResendInvite();
  const { addToast } = useToast();
  const [generatingLink, setGeneratingLink] = React.useState(false);

  const isMutating =
    deactivateUserMutation.isPending ||
    reactivateUserMutation.isPending ||
    deleteInviteMutation.isPending ||
    resendInviteMutation.isPending ||
    generatingLink;

  const handleGenerateLink = async () => {
    if (!user.email) return;
    if (generatingLink) return;
    setGeneratingLink(true);
    try {
      const res: any = await resendInvite({ email: user.email, link_only: true } as any);
      const link = (res?.action_link || res?.data?.action_link) as string | undefined;
      if (!link) {
        addToast("Não foi possível gerar o link agora. Tente reenviar o convite.", "error");
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        addToast("Link gerado e copiado. Envie ao usuário (use sempre o link mais recente).", "success");
      } catch {
        addToast(`Link gerado. Copie e envie ao usuário: ${link}`, "success");
      }
    } catch (e: any) {
      addToast(e?.message || "Falha ao gerar link.", "error");
    } finally {
      setGeneratingLink(false);
    }
  };

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
              onClick={handleGenerateLink}
              disabled={isMutating || !user.email}
            >
              <Copy className="mr-2 h-4 w-4" />
              Gerar link (copiar)
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
