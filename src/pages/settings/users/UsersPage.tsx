import React, { useState, useEffect } from 'react';
import { UsersFilters as Filters, EmpresaUser, UserRole, UserStatus } from '@/features/users/types';
import { useUsers } from '@/features/users/hooks/useUsersQuery';
import { UsersTable } from '@/features/users/components/UsersTable';
import { EditUserRoleDrawer } from '@/features/users/EditUserRoleDrawer';
import { Loader2, Users, UserPlus } from 'lucide-react';
import { useCan } from '@/hooks/useCan';
import { InviteUserDialog } from '@/features/users/InviteUserDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import UsersFilters from '@/features/users/components/UsersFilters';
import Pagination from '@/components/ui/Pagination';
import { UsersTableSkeleton } from '@/features/users/components/UsersTableSkeleton';

const PAGE_SIZE = 10;

export default function UsersPage() {
  const [filters, setFilters] = useState<Filters>({ q: '', role: [], status: [] });
  const [page, setPage] = useState(1);
  const { users, count, isLoading, isError, error, refetch } = useUsers(filters, page, PAGE_SIZE);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<EmpresaUser | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const canManage = useCan('usuarios', 'manage');

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
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Usuários</h1>
        {canManage && (
          <Button onClick={() => setIsInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Convidar Usuário
          </Button>
        )}
      </div>

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
