import React, { useMemo, useState } from 'react';
import { ExtratoItem } from '@/services/treasury';
import { Link2, Unlink, AlertCircle, Loader2 } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

interface Props {
  extratos: ExtratoItem[];
  onConciliate: (item: ExtratoItem) => void;
  onUnconciliate: (item: ExtratoItem) => void;
  busyExtratoId?: string | null;
}

export default function ExtratosTable({ extratos, onConciliate, onUnconciliate, busyExtratoId }: Props) {
  const columns: TableColumnWidthDef[] = [
    { id: 'data', defaultWidth: 160, minWidth: 140 },
    { id: 'descricao', defaultWidth: 420, minWidth: 220 },
    { id: 'valor', defaultWidth: 160, minWidth: 140 },
    { id: 'vinculo', defaultWidth: 420, minWidth: 240 },
    { id: 'acoes', defaultWidth: 180, minWidth: 160 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'financeiro:tesouraria:extratos', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'data', direction: 'desc' });
  const sortedExtratos = useMemo(() => {
    return sortRows(
      extratos,
      sort as any,
      [
        { id: 'data', type: 'date', getValue: (e) => e.data_lancamento },
        { id: 'descricao', type: 'string', getValue: (e) => e.descricao ?? '' },
        { id: 'valor', type: 'number', getValue: (e) => e.valor ?? 0 },
        {
          id: 'vinculo',
          type: 'custom',
          getValue: (e) => (e.conciliado ? `1:${e.movimentacao_descricao ?? ''}` : `0:${e.descricao ?? ''}`),
          compare: (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' }),
        },
      ] as const
    );
  }, [extratos, sort]);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh
              columnId="data"
              label="Data"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="descricao"
              label="Descrição"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="valor"
              label="Valor"
              align="right"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="vinculo"
              label="Vínculo (Movimentação)"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="acoes"
              label="Ações"
              align="center"
              sortable={false}
              resizable
              onResizeStart={startResize as any}
            />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedExtratos.map(item => (
            (() => {
              const isBusy = !!busyExtratoId && busyExtratoId === item.id;
              return (
            <tr key={item.id} className={`hover:bg-gray-50 ${item.conciliado ? 'bg-green-50/30' : ''}`}>
              <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                {new Date(item.data_lancamento).toLocaleDateString('pt-BR')}
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900 font-medium">{item.descricao}</div>
                {item.documento_ref && <div className="text-xs text-gray-500">Doc: {item.documento_ref}</div>}
              </td>
              <td className={`px-6 py-4 text-right text-sm font-bold ${item.tipo_lancamento === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                {item.tipo_lancamento === 'credito' ? '+' : '-'}{new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(item.valor)}
              </td>
              <td className="px-6 py-4 text-sm">
                {item.conciliado && item.movimentacao_id ? (
                    <div className="flex flex-col">
                        <a
                          href={`/app/financeiro/tesouraria?tab=movimentos&open=${encodeURIComponent(item.movimentacao_id)}`}
                          className="font-medium text-gray-800 hover:underline underline-offset-2"
                          title="Abrir movimentação"
                        >
                          {item.movimentacao_descricao}
                        </a>
                        <span className="text-xs text-gray-500">
                            {new Date(item.movimentacao_data!).toLocaleDateString('pt-BR')} • 
                            R$ {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(item.movimentacao_valor!)}
                        </span>
                    </div>
                ) : (
                    <span className="text-gray-400 text-xs italic">Pendente</span>
                )}
              </td>
              <td className="px-6 py-4 text-center">
                {item.conciliado ? (
                    <button 
                        onClick={() => (isBusy ? undefined : onUnconciliate(item))}
                        disabled={isBusy}
                        className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Desfazer Conciliação"
                    >
                        {isBusy ? <Loader2 className="animate-spin" size={18} /> : <Unlink size={18} />}
                    </button>
                ) : (
                    <button 
                        onClick={() => (isBusy ? undefined : onConciliate(item))}
                        disabled={isBusy}
                        className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors flex items-center gap-1 mx-auto disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Conciliar"
                    >
                        {isBusy ? <Loader2 className="animate-spin" size={18} /> : <Link2 size={18} />}
                        <span className="text-xs font-semibold">Conciliar</span>
                    </button>
                )}
              </td>
            </tr>
              );
            })()
          ))}
          {sortedExtratos.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                <AlertCircle className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                Nenhum lançamento encontrado no extrato.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
