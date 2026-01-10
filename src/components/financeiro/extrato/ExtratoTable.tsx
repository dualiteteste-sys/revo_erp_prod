import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExtratoLancamento } from '@/services/extrato';
import { formatCurrency } from '@/lib/utils';
import { CheckCircle, Circle, Link2 } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

interface Props {
  lancamentos: ExtratoLancamento[];
}

export default function ExtratoTable({ lancamentos }: Props) {
  const columns: TableColumnWidthDef[] = [
    { id: 'data', defaultWidth: 150, minWidth: 140 },
    { id: 'conta', defaultWidth: 220, minWidth: 180 },
    { id: 'descricao', defaultWidth: 520, minWidth: 220 },
    { id: 'valor', defaultWidth: 150, minWidth: 140 },
    { id: 'saldo', defaultWidth: 150, minWidth: 140 },
    { id: 'conc', defaultWidth: 90, minWidth: 80 },
    { id: 'vinculo', defaultWidth: 220, minWidth: 160 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'financeiro:extrato:lancamentos', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'data', direction: 'desc' });
  const sortedLancamentos = useMemo(() => {
    return sortRows(
      lancamentos,
      sort as any,
      [
        { id: 'data', type: 'date', getValue: (l) => l.data_lancamento },
        { id: 'conta', type: 'string', getValue: (l) => l.conta_nome ?? '' },
        { id: 'descricao', type: 'string', getValue: (l) => l.descricao ?? '' },
        { id: 'valor', type: 'number', getValue: (l) => l.valor ?? 0 },
        { id: 'saldo', type: 'number', getValue: (l) => l.saldo_apos_lancamento ?? 0 },
        { id: 'conc', type: 'boolean', getValue: (l) => Boolean(l.conciliado) },
        { id: 'vinculo', type: 'string', getValue: (l) => l.movimentacao_descricao ?? '' },
      ] as const
    );
  }, [lancamentos, sort]);

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
              columnId="conta"
              label="Conta"
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
              columnId="saldo"
              label="Saldo"
              align="right"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="conc"
              label="Conc."
              align="center"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="vinculo"
              label="Vínculo"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {sortedLancamentos.map((item) => (
              <motion.tr
                key={item.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(item.data_lancamento).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {item.conta_nome}
                </td>
                <td className="px-6 py-4 text-sm text-gray-800">
                  <div className="font-medium">{item.descricao}</div>
                  {item.documento_ref && <div className="text-xs text-gray-500">Doc: {item.documento_ref}</div>}
                </td>
                <td className={`px-6 py-4 text-right text-sm font-bold ${item.tipo_lancamento === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                  {item.tipo_lancamento === 'credito' ? '+' : '-'}{formatCurrency(item.valor * 100)}
                </td>
                <td className="px-6 py-4 text-right text-sm text-gray-700">
                  {item.saldo_apos_lancamento !== null ? formatCurrency(item.saldo_apos_lancamento * 100) : '-'}
                </td>
                <td className="px-6 py-4 text-center">
                  {item.conciliado ? (
                    <CheckCircle size={16} className="text-green-500 mx-auto" title="Conciliado" />
                  ) : (
                    <Circle size={16} className="text-gray-300 mx-auto" title="Pendente" />
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {item.movimentacao_id ? (
                    <div className="flex items-center gap-1 text-blue-600" title={item.movimentacao_descricao || 'Movimentação'}>
                      <Link2 size={14} />
                      <span className="truncate max-w-[150px]">{item.movimentacao_descricao || 'Vínculo'}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">-</span>
                  )}
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
          {sortedLancamentos.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                Nenhum lançamento encontrado para os filtros selecionados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
