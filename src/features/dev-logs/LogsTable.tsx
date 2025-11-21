import React from 'react';
import { AuditEvent } from './types';
import { Loader2 } from 'lucide-react';

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

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origem</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Operação</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tabela</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ator</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resumo/PK</th>
              <th className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {events.map(event => (
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
