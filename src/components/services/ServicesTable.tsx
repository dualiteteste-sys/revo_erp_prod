// src/components/services/ServicesTable.tsx
import React from 'react';
import { Edit, Trash2, Copy, ArrowUpDown } from 'lucide-react';
import { Service } from '@/services/services';

type Props = {
  services: Service[];
  onEdit: (s: Service) => void;
  onDelete: (s: Service) => void;
  onClone: (s: Service) => void;
  sortBy: { column: keyof Service; ascending: boolean };
  onSort: (column: keyof Service) => void;
};

const SortableHeader: React.FC<{
  column: keyof Service;
  label: string;
  sortBy: { column: keyof Service; ascending: boolean };
  onSort: (column: keyof Service) => void;
}> = ({ column, label, sortBy, onSort }) => {
  const isSorted = sortBy.column === column;
  return (
    <th
      scope="col"
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-2">
        {label}
        {isSorted && <ArrowUpDown size={14} className={sortBy.ascending ? '' : 'rotate-180'} />}
      </div>
    </th>
  );
};

export default function ServicesTable({ services, onEdit, onDelete, onClone, sortBy, onSort }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader column="descricao" label="Descrição" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="codigo" label="Código" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="preco_venda" label="Preço" sortBy={sortBy} onSort={onSort} />
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidade</th>
            <SortableHeader column="status" label="Status" sortBy={sortBy} onSort={onSort} />
            <th className="px-6 py-3" />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {services.map((s) => (
            <tr key={s.id}>
              <td className="px-6 py-4 text-sm text-gray-900">{s.descricao}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{s.codigo || '—'}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{s.preco_venda ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(s.preco_venda)) : '—'}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{s.unidade ?? '—'}</td>
              <td className="px-6 py-4 text-sm">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${s.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {s.status}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => onClone(s)} className="text-blue-600 hover:text-blue-900" title="Clonar">
                    <Copy size={18} />
                  </button>
                  <button onClick={() => onEdit(s)} className="text-indigo-600 hover:text-indigo-900" title="Editar">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => onDelete(s)} className="text-red-600 hover:text-red-900" title="Remover">
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {services.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-16 text-center text-gray-400">Nenhum serviço encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
