import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as usersService from '@/services/users';
import { UsersFilters, EmpresaUser } from '../types';
import { useToast } from '@/contexts/ToastProvider';

const USERS_QUERY_KEY = 'users';

export const useUsers = (filters: UsersFilters, page: number, pageSize: number) => {
  const queryKey = [USERS_QUERY_KEY, filters, page, pageSize];
  
  const usersQuery = useQuery({
    queryKey,
    queryFn: () => usersService.listUsers(filters, page, pageSize),
  });

  const countQuery = useQuery({
    queryKey: [USERS_QUERY_KEY, 'count', filters],
    queryFn: () => usersService.countUsers(filters),
  });

  return {
    users: usersQuery.data ?? [],
    count: countQuery.data ?? 0,
    isLoading: usersQuery.isLoading || countQuery.isLoading,
    isError: usersQuery.isError || countQuery.isError,
    error: usersQuery.error || countQuery.error,
    refetch: () => {
      usersQuery.refetch();
      countQuery.refetch();
    }
  };
};

const useUserMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  successMessage: string
) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      addToast(successMessage, 'success');
      queryClient.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
    },
    onError: (error: any) => {
      addToast(error.message || 'Ocorreu um erro.', 'error');
    },
  });
};

export const useDeactivateUser = () => useUserMutation(
  (userId: string) => usersService.deactivateUser(userId),
  'Usuário desativado com sucesso.'
);

export const useReactivateUser = () => useUserMutation(
  (userId: string) => usersService.reactivateUser(userId),
  'Usuário reativado com sucesso.'
);

export const useDeleteInvite = () => useUserMutation(
  (userId: string) => usersService.deletePendingInvitation(userId),
  'Convite excluído com sucesso.'
);

export const useUpdateUserRole = () => useUserMutation(
  (vars: { userId: string; role: EmpresaUser['role'] }) => usersService.updateUserRole(vars.userId, vars.role),
  'Papel do usuário atualizado com sucesso.'
);

export const useResendInvite = () => useUserMutation(
    (email: string) => usersService.resendInviteClient({ email }),
    'Convite reenviado com sucesso.'
);
