import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UsersFilters as Filters, EmpresaUser } from '@/features/users/types';
import { useUsers } from '@/features/users/hooks/useUsersQuery';
import { UsersTable } from '@/features/users/components/UsersTable';
import { EditUserRoleDrawer } from '@/features/users/EditUserRoleDrawer';
import { Users, UserPlus } from 'lucide-react';
import { useCan } from '@/hooks/useCan';
import { InviteUserDialog } from '@/features/users/InviteUserDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import UsersFilters from '@/features/users/components/UsersFilters';
import Pagination from '@/components/ui/Pagination';
import { UsersTableSkeleton } from '@/features/users/components/UsersTableSkeleton';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { useSupabase } from '@/providers/SupabaseProvider';

const PAGE_SIZE = 10;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ q: '', role: [], status: [] });
  const [page, setPage] = useState(1);
  const { users, count, isLoading, isError, error, refetch } = useUsers(filters, page, PAGE_SIZE);
  const empresaFeatures = useEmpresaFeatures();
  const supabase = useSupabase();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<EmpresaUser | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const canManage = useCan('usuarios', 'manage');
  const maxUsers = empresaFeatures.max_users;

  const parseCount = (v: unknown): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return 0;
  };

  const activeCountQuery = useQuery({
    queryKey: ['users', 'count', 'ACTIVE'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('count_users_for_current_empresa', {
        p_q: null,
        p_status: ['ACTIVE'],
        p_role: null,
      });
      if (error) throw error;
      return parseCount(data);
    },
    staleTime: 15_000,
  });

  const pendingCountQuery = useQuery({
    queryKey: ['users', 'count', 'PENDING'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('count_users_for_current_empresa', {
        p_q: null,
        p_status: ['PENDING'],
        p_role: null,
      });
      if (error) throw error;
      return parseCount(data);
    },
    staleTime: 15_000,
  });

  const activeUsers = activeCountQuery.data ?? 0;
  const pendingInvites = pendingCountQuery.data ?? 0;
  const reservedSeats = activeUsers + pendingInvites;
  const reachedLimit =
    !empresaFeatures.loading && typeof maxUsers === 'number' && maxUsers > 0 && reservedSeats >= maxUsers;

  const handleFilterChange = (patch: Partial<Filters>) => {
    setPage(1); // Reset page on filter change
    setFilters(prev => ({ ...prev, ...patch }));
  };

  const handleEditRole = (user: EmpresaUser) => {
    setSelectedUser(user);
    setIsEditOpen(true);
  };

  const handleDataUpdate = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['users', 'count', 'ACTIVE'] });
    queryClient.invalidateQueries({ queryKey: ['users', 'count', 'PENDING'] });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Usuários</h1>
          {!empresaFeatures.loading && (
            <div className="mt-1 text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{activeUsers}</span> ativos •{' '}
              <span className="font-semibold text-gray-700">{pendingInvites}</span> convites pendentes •{' '}
              limite: <span className="font-semibold text-gray-700">{reservedSeats}</span> /{' '}
              <span className="font-semibold text-gray-700">{maxUsers}</span>
            </div>
          )}
        </div>
        {canManage && (
          <Button
            onClick={() => setIsInviteOpen(true)}
            disabled={reachedLimit}
            title={
              reachedLimit
                ? 'Limite de usuários atingido (ativos + convites pendentes). Ajuste em Configurações → Minha Assinatura.'
                : 'Convidar novo usuário'
            }
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Convidar Usuário
          </Button>
        )}
      </div>

      {reachedLimit && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Limite de usuários atingido (ativos + convites pendentes). Ajuste o limite em{' '}
          <span className="font-semibold">Configurações → Minha Assinatura</span>.
        </div>
      )}

      <UsersFilters filters={filters} onFilterChange={handleFilterChange} />

      {isLoading ? (
        <UsersTableSkeleton />
      ) : isError ? (
        <div className="text-center text-red-500 p-8">{(error as Error)?.message || 'Erro ao carregar usuários.'}</div>
      ) : users.length === 0 ? (
        <div className="text-center p-8 text-gray-500 bg-white rounded-lg shadow">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium">Nenhum usuário encontrado</h3>
          <p className="mt-1 text-sm">Tente ajustar os filtros ou convide um novo usuário.</p>
        </div>
      ) : (
        <>
          <UsersTable
            rows={users}
            onEditRole={handleEditRole}
          />
          <Pagination
            currentPage={page}
            totalCount={count}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
      
      {selectedUser && (
        <EditUserRoleDrawer
          open={isEditOpen}
          user={selectedUser}
          onClose={() => setIsEditOpen(false)}
          onUpdate={handleDataUpdate}
        />
      )}
      
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Convidar novo usuário</DialogTitle>
                <DialogDescription>
                    O usuário receberá um e-mail com instruções para acessar a empresa.
                </DialogDescription>
            </DialogHeader>
            <InviteUserDialog 
                onClose={() => setIsInviteOpen(false)} 
                onInviteSent={handleDataUpdate}
            />
        </DialogContent>
      </Dialog>
    </div>
  );
}
