import React from 'react';
import { UsersFilters as Filters, UserRole, UserStatus } from '../types';
import Input from '@/components/ui/forms/Input';
import MultiSelect from '@/components/ui/MultiSelect';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

type UsersFiltersProps = {
  filters: Filters;
  onFilterChange: (patch: Partial<Filters>) => void;
};

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'OWNER', label: 'Proprietário' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'FINANCE', label: 'Financeiro' },
  { value: 'OPS', label: 'Operações' },
  { value: 'READONLY', label: 'Somente Leitura' },
];

const statusOptions: { value: UserStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'SUSPENDED', label: 'Suspenso' },
  { value: 'INACTIVE', label: 'Inativo' },
];

const UsersFilters: React.FC<UsersFiltersProps> = ({ filters, onFilterChange }) => {
  const handleClearFilters = () => {
    onFilterChange({ q: '', role: [], status: [] });
  };

  return (
    <div className="mb-4 p-4 border bg-gray-50/50 rounded-xl">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="md:col-span-2 relative">
          <label htmlFor="user-search" className="block text-sm font-medium text-gray-700 mb-1">Buscar por nome ou e-mail</label>
          <Search className="absolute left-3 top-10 transform -translate-y-1/2 text-gray-400" size={20} />
          <Input
            id="user-search"
            label=""
            placeholder="Digite para buscar..."
            value={filters.q || ''}
            onChange={(e) => onFilterChange({ q: e.target.value })}
            className="pl-10"
          />
        </div>
        <MultiSelect
          label="Papel"
          options={roleOptions}
          selected={filters.role || []}
          onChange={(roles) => onFilterChange({ role: roles as UserRole[] })}
          placeholder="Todos os papéis"
        />
        <MultiSelect
          label="Status"
          options={statusOptions}
          selected={filters.status || []}
          onChange={(status) => onFilterChange({ status: status as UserStatus[] })}
          placeholder="Todos os status"
        />
        <div className="md:col-start-4 flex justify-end">
            <Button variant="ghost" onClick={handleClearFilters}>Limpar Filtros</Button>
        </div>
      </div>
    </div>
  );
};

export default UsersFilters;
