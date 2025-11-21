import React from 'react';
import { useRoles } from './hooks/useRbac';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Role } from './types';

interface RolesListProps {
  selectedRoleId: string | null;
  onSelectRole: (roleId: string) => void;
}

export const RolesList: React.FC<RolesListProps> = ({ selectedRoleId, onSelectRole }) => {
  const { data: roles, isLoading, isError } = useRoles();

  if (isLoading) {
    return (
      <div className="w-full md:w-64 p-4">
        <div className="h-6 bg-gray-200 rounded w-1/2 mb-4 animate-pulse"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 rounded-lg mb-2 animate-pulse"></div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <div className="p-4 text-red-500">Erro ao carregar papéis.</div>;
  }

  return (
    <aside className="w-full md:w-64 p-4 flex-shrink-0 bg-gray-50/50 rounded-2xl">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Papéis</h2>
      <nav className="space-y-1">
        {roles?.map((role: Role) => (
          <button
            key={role.id}
            onClick={() => onSelectRole(role.id)}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm rounded-lg text-left transition-colors ${
              selectedRoleId === role.id
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-gray-700 hover:bg-gray-200/50'
            }`}
          >
            <span className="truncate">{role.name}</span>
            {role.slug === 'OWNER' && <ShieldCheck size={16} className="text-yellow-400 flex-shrink-0" />}
          </button>
        ))}
      </nav>
    </aside>
  );
};
