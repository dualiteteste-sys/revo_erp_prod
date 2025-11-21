import React from 'react';
import { EmpresaUser, UserStatus } from '../types';
import UserActionsMenu from './UserActionsMenu';

type UsersTableProps = {
  rows: EmpresaUser[];
  onEditRole: (user: EmpresaUser) => void;
};

const roleLabels: Record<EmpresaUser['role'], string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Admin',
  FINANCE: 'Financeiro',
  OPS: 'Operações',
  READONLY: 'Somente Leitura',
};

const statusConfig: Record<UserStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativo', color: 'bg-green-100 text-green-800' },
  PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
  SUSPENDED: { label: 'Suspenso', color: 'bg-gray-200 text-gray-800' },
  INACTIVE: { label: 'Inativo', color: 'bg-gray-200 text-gray-800' },
};

export const UsersTable: React.FC<UsersTableProps> = ({ rows, onEditRole }) => {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome / Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Papel</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Último Acesso</th>
              <th className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map(user => (
              <tr key={user.user_id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{user.name || '(Não confirmado)'}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{roleLabels[user.role] || user.role}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig[user.status]?.color || 'bg-gray-100'}`}>
                    {statusConfig[user.status]?.label || user.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR') : 'Nunca'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <UserActionsMenu user={user} onEdit={() => onEditRole(user)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
