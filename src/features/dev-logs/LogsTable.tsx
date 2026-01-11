import React, { useMemo, useState } from 'react';
import { AuditEvent } from './types';
import { Loader2 } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

interface LogsTableProps {
  events: AuditEvent[];
  onShowDetails: (event: AuditEvent) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}

const MemoizedLogsTable: React.FC<LogsTableProps> = ({ events, onShowDetails, onLoadMore, hasMore, isLoadingMore }) => {
  
  const renderPkSummary = (pk: Record<string, unknown> | null): string => {
    if (!pk) return '-';
    if (typeof pk.id === 'string' && pk.id) {
      return pk.id;
    }
    const keys = Object.keys(pk);
    if (keys.length > 0) {
      const firstKey = keys[0];
      const firstValue = pk[firstKey];
      return `${firstKey}: ${String(firstValue)}`;
    }
    return JSON.stringify(pk);
  };

  const columns: TableColumnWidthDef[] = [
    { id: 'data_hora', defaultWidth: 200, minWidth: 180 },
    { id: 'origem', defaultWidth: 140, minWidth: 120 },
    { id: 'operacao', defaultWidth: 140, minWidth: 120 },
    { id: 'tabela', defaultWidth: 200, minWidth: 160 },
    { id: 'ator', defaultWidth: 240, minWidth: 180 },
    { id: 'pk', defaultWidth: 240, minWidth: 180 },
    { id: 'acoes', defaultWidth: 120, minWidth: 100 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'dev:logs', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'data_hora', direction: 'desc' });
  const sortedEvents = useMemo(() => {
    return sortRows(
      events,
      sort as any,
      [
        { id: 'data_hora', type: 'date', getValue: (e) => e.occurred_at },
        { id: 'origem', type: 'string', getValue: (e) => e.source ?? '' },
        { id: 'operacao', type: 'string', getValue: (e) => e.op ?? '' },
        { id: 'tabela', type: 'string', getValue: (e) => e.table_name ?? '' },
        { id: 'ator', type: 'string', getValue: (e) => e.actor_email ?? 'Sistema' },
        { id: 'pk', type: 'string', getValue: (e) => renderPkSummary(e.pk) },
      ] as const
    );
  }, [events, sort]);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <TableColGroup columns={columns} widths={widths} />
          <thead className="bg-gray-50">
            <tr>
              <ResizableSortableTh
                columnId="data_hora"
                label="Data/Hora"
                sort={sort as any}
                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                onResizeStart={startResize as any}
              />
              <ResizableSortableTh
                columnId="origem"
                label="Origem"
                sort={sort as any}
                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                onResizeStart={startResize as any}
              />
              <ResizableSortableTh
                columnId="operacao"
                label="Operação"
                sort={sort as any}
                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                onResizeStart={startResize as any}
              />
              <ResizableSortableTh
                columnId="tabela"
                label="Tabela"
                sort={sort as any}
                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                onResizeStart={startResize as any}
              />
              <ResizableSortableTh
                columnId="ator"
                label="Ator"
                sort={sort as any}
                onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                onResizeStart={startResize as any}
              />
              <ResizableSortableTh
                columnId="pk"
                label="Resumo/PK"
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
            {sortedEvents.map(event => (
              <tr key={event.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(event.occurred_at).toLocaleString('pt-BR')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{event.source}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{event.op}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{event.table_name || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{event.actor_email || 'Sistema'}</td>
                <td 
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs"
                  title={event.pk ? JSON.stringify(event.pk) : ''}
                >
                  {renderPkSummary(event.pk)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => onShowDetails(event)} className="text-blue-600 hover:text-blue-900">
                    Detalhes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="p-4 text-center">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 disabled:opacity-50"
          >
            {isLoadingMore ? <Loader2 className="animate-spin" size={16} /> : null}
            Carregar mais
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(MemoizedLogsTable);
