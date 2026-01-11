import React, { useMemo, useState } from 'react';
import { EmpresaUser } from './types';
import { Trash2 } from 'lucide-react';
import { useCan } from '@/hooks/useCan';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

type Props = {
  rows: EmpresaUser[];
  onEditRole: (u: EmpresaUser) => void;
  onDeleteInvite: (u: EmpresaUser) => void;
};

const roleLabels: Partial<Record<EmpresaUser['role'], string>> = {
  OWNER: 'Proprietário',
  ADMIN: 'Admin',
  MEMBER: 'Membro',
  FINANCE: 'Financeiro',
  OPS: 'Operações',
  VIEWER: 'Somente Leitura',
  READONLY: 'Somente Leitura',
};

const statusConfig: Record<EmpresaUser['status'], { label: string; color: string }> = {
  ACTIVE: { label: 'Ativo', color: 'bg-green-100 text-green-800' },
  PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
  INACTIVE: { label: 'Inativo', color: 'bg-gray-100 text-gray-800' },
};

export function UsersTable({ rows, onEditRole, onDeleteInvite }: Props) {
  const canManage = useCan('usuarios', 'manage');

  const columns: TableColumnWidthDef[] = [
    { id: 'nome_email', defaultWidth: 420, minWidth: 220 },
    { id: 'papel', defaultWidth: 160, minWidth: 140 },
    { id: 'status', defaultWidth: 160, minWidth: 140 },
    { id: 'ultimo_acesso', defaultWidth: 180, minWidth: 160 },
    { id: 'acoes', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'usuarios:list', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'nome_email', direction: 'asc' });
  const sortedRows = useMemo(() => {
    return sortRows(
      rows,
      sort as any,
      [
        { id: 'nome_email', type: 'string', getValue: (u) => `${u.name ?? ''} ${u.email ?? ''}` },
        { id: 'papel', type: 'string', getValue: (u) => roleLabels[u.role] ?? String(u.role ?? '') },
        { id: 'status', type: 'string', getValue: (u) => statusConfig[u.status]?.label ?? String(u.status ?? '') },
        { id: 'ultimo_acesso', type: 'date', getValue: (u) => u.last_sign_in_at ?? null },
      ] as const
    );
  }, [rows, sort]);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <TableColGroup columns={columns} widths={widths} />
          <thead className="bg-gray-50">
            <tr>
              <ResizableSortableTh
                columnId="nome_email"
                label="Nome / Email"
                sort={sort as any}
                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                onResizeStart={startResize as any}
              />
              <ResizableSortableTh
                columnId="papel"
                label="Papel"
                sort={sort as any}
                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                onResizeStart={startResize as any}
              />
              <ResizableSortableTh
                columnId="status"
                label="Status"
                sort={sort as any}
                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                onResizeStart={startResize as any}
              />
              <ResizableSortableTh
                columnId="ultimo_acesso"
                label="Último Acesso"
                sort={sort as any}
                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                onResizeStart={startResize as any}
              />
              <ResizableSortableTh
                columnId="acoes"
                label="Ações"
                align="right"
                sortable={false}
                resizable
                onResizeStart={startResize as any}
              />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedRows.map(user => (
              <tr key={user.user_id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{user.name || '(Não confirmado)'}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{roleLabels[user.role] || user.role}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig[user.status].color}`}>
                    {statusConfig[user.status].label}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR') : 'Nunca'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {user.status === 'PENDING' && canManage ? (
                    <button onClick={() => onDeleteInvite(user)} className="text-red-600 hover:text-red-900 p-2 rounded-full hover:bg-red-100" title="Excluir convite">
                      <Trash2 size={18} />
                    </button>
                  ) : (
                    <button onClick={() => onEditRole(user)} className="text-indigo-600 hover:text-indigo-900" disabled={!canManage}>
                      Gerenciar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
