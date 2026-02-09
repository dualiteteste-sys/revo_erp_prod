import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Movimentacao } from '@/services/treasury';
import { CheckCircle, ChevronDown, ChevronRight, Circle, Edit, Trash2 } from 'lucide-react';
import ResizableSortableTh from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';
import { formatDatePtBR } from '@/lib/dateDisplay';

interface Props {
  movimentacoes: Movimentacao[];
  onEdit: (mov: Movimentacao) => void;
  onDelete: (mov: Movimentacao) => void;
}

type MovsDayGroup = {
  dateISO: string; // YYYY-MM-DD
  items: Movimentacao[];
  totalEntradas: number;
  totalSaidas: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function deltaForMov(mov: Movimentacao): number {
  const entrada = safeNumber(mov.valor_entrada);
  const saida = safeNumber(mov.valor_saida);
  return round2(entrada - saida);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(value);
}

export default function MovimentacoesTable({ movimentacoes, onEdit, onDelete }: Props) {
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);

  const columns: TableColumnWidthDef[] = [
    { id: 'data', defaultWidth: 160, minWidth: 140 },
    { id: 'descricao', defaultWidth: 520, minWidth: 240 },
    { id: 'entrada', defaultWidth: 150, minWidth: 130 },
    { id: 'saida', defaultWidth: 150, minWidth: 130 },
    { id: 'saldo', defaultWidth: 150, minWidth: 130 },
    { id: 'conciliado', defaultWidth: 110, minWidth: 90 },
    { id: 'acoes', defaultWidth: 120, minWidth: 90, maxWidth: 180 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'financeiro:tesouraria:movs', columns });

  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [allCollapsed, setAllCollapsed] = useState(false);
  const dayGroups = useMemo<MovsDayGroup[]>(() => {
    const groups: MovsDayGroup[] = [];

    for (const item of movimentacoes) {
      const dateISO = String(item.data_movimento || '').slice(0, 10);
      const entrada = safeNumber(item.valor_entrada);
      const saida = safeNumber(item.valor_saida);
      const last = groups.length > 0 ? groups[groups.length - 1] : undefined;

      if (!last || last.dateISO !== dateISO) {
        groups.push({
          dateISO,
          items: [item],
          totalEntradas: entrada,
          totalSaidas: saida,
          saldoInicial: null,
          saldoFinal: null,
        });
      } else {
        last.items.push(item);
        last.totalEntradas += entrada;
        last.totalSaidas += saida;
      }
    }

    for (const g of groups) {
      g.totalEntradas = round2(g.totalEntradas);
      g.totalSaidas = round2(g.totalSaidas);

      const first = g.items[0];
      const last = g.items[g.items.length - 1];
      const firstSaldo = first?.saldo_acumulado ?? null;
      const lastSaldo = last?.saldo_acumulado ?? null;
      g.saldoFinal = lastSaldo !== null && lastSaldo !== undefined ? round2(safeNumber(lastSaldo)) : null;
      if (firstSaldo !== null && firstSaldo !== undefined) {
        const firstSaldoNum = round2(safeNumber(firstSaldo));
        g.saldoInicial = round2(firstSaldoNum - deltaForMov(first!));
      } else {
        g.saldoInicial = null;
      }
    }

    return groups;
  }, [movimentacoes]);

  const toggleAllDays = () => {
    const next = !allCollapsed;
    const nextState: Record<string, boolean> = {};
    for (const g of dayGroups) nextState[g.dateISO] = next;
    setCollapsedDays(nextState);
    setAllCollapsed(next);
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <th colSpan={7} className="px-6 py-2 text-right">
              <button
                type="button"
                onClick={toggleAllDays}
                className="text-xs font-medium text-blue-700 hover:text-blue-800"
                disabled={dayGroups.length === 0}
              >
                {allCollapsed ? 'Expandir todos os dias' : 'Recolher todos os dias'}
              </button>
            </th>
          </tr>
          <tr>
            <ResizableSortableTh
              columnId="data"
              label="Data"
              sortable={false}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="descricao"
              label="Descrição"
              sortable={false}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="entrada"
              label="Entrada"
              align="right"
              sortable={false}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="saida"
              label="Saída"
              align="right"
              sortable={false}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="saldo"
              label="Saldo"
              align="right"
              sortable={false}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="conciliado"
              label="Conc."
              align="center"
              sortable={false}
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
          <AnimatePresence>
            {dayGroups.map((g) => {
              const isCollapsed = !!collapsedDays[g.dateISO];
              return (
                <React.Fragment key={`day-${g.dateISO}`}>
                  <motion.tr
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-slate-50/70 hover:bg-slate-100/70"
                  >
                    <td colSpan={7} className="px-6 py-3">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between gap-4"
                        onClick={() => {
                          const nextCollapsed = !isCollapsed;
                          setCollapsedDays((prev) => ({ ...prev, [g.dateISO]: nextCollapsed }));
                          const everyCollapsed = dayGroups.every((group) =>
                            group.dateISO === g.dateISO ? nextCollapsed : !!collapsedDays[group.dateISO]
                          );
                          setAllCollapsed(everyCollapsed);
                        }}
                        title={isCollapsed ? 'Expandir dia' : 'Recolher dia'}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                          {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                          <span>{formatDatePtBR(g.dateISO)}</span>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-xs">
                          <div className="text-green-700">
                            Entradas:{' '}
                            <span className="font-semibold">
                              R$ {formatMoney(g.totalEntradas)}
                            </span>
                          </div>
                          <div className="text-red-700">
                            Saídas:{' '}
                            <span className="font-semibold">
                              R$ {formatMoney(g.totalSaidas)}
                            </span>
                          </div>
                          <div className="text-gray-700">
                            Saldo inicial:{' '}
                            <span className="font-semibold">
                              {g.saldoInicial !== null ? `R$ ${formatMoney(g.saldoInicial)}` : '—'}
                            </span>
                          </div>
                          <div className="text-gray-900">
                            Saldo final:{' '}
                            <span className="font-semibold">
                              {g.saldoFinal !== null ? `R$ ${formatMoney(g.saldoFinal)}` : '—'}
                            </span>
                          </div>
                        </div>
                      </button>
                    </td>
                  </motion.tr>

                  {isCollapsed
                    ? null
                    : g.items.map((mov) => {
                        const href = `/app/financeiro/tesouraria?tab=movimentos&open=${encodeURIComponent(mov.id)}`;
                        const canEdit = !mov.conciliado;
                        return (
                          <motion.tr
                            key={mov.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="hover:bg-gray-50 transition-colors"
                            onDoubleClick={(e) => {
                              if (shouldIgnoreRowDoubleClickEvent(e)) return;
                              openInNewTabBestEffort(href, () => onEdit(mov));
                            }}
                          >
                            <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{formatDatePtBR(mov.data_movimento)}</td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900 font-medium">
                                <a
                                  href={href}
                                  className={`underline-offset-2 ${canEdit ? 'hover:underline' : 'text-gray-900/90 hover:underline'}`}
                                  onClick={(e) => {
                                    if (!isPlainLeftClick(e)) return;
                                    e.preventDefault();
                                    scheduleEdit(() => onEdit(mov));
                                  }}
                                  onDoubleClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    cancelScheduledEdit();
                                    openInNewTabBestEffort(href, () => onEdit(mov));
                                  }}
                                  title={canEdit ? 'Editar movimentação' : 'Visualizar movimentação'}
                                >
                                  {mov.descricao}
                                </a>
                              </div>
                              <div className="text-xs text-gray-500">
                                {String(mov.origem_tipo || '').startsWith('transferencia_interna') ? (
                                  <span className="mr-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                                    Transferência interna
                                  </span>
                                ) : null}
                                {mov.categoria ? <span className="mr-2 bg-gray-100 px-1 rounded">{mov.categoria}</span> : null}
                                {mov.documento_ref ? <span>Doc: {mov.documento_ref}</span> : null}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right text-sm text-green-600 font-medium">
                              {safeNumber(mov.valor_entrada) ? formatMoney(safeNumber(mov.valor_entrada)) : ''}
                            </td>
                            <td className="px-6 py-4 text-right text-sm text-red-600 font-medium">
                              {safeNumber(mov.valor_saida) ? formatMoney(safeNumber(mov.valor_saida)) : ''}
                            </td>
                            <td className="px-6 py-4 text-right text-sm font-bold text-gray-800">
                              {mov.saldo_acumulado !== undefined && mov.saldo_acumulado !== null
                                ? formatMoney(safeNumber(mov.saldo_acumulado))
                                : '-'}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {mov.conciliado ? (
                                <span title="Conciliado">
                                  <CheckCircle size={16} className="text-green-500 mx-auto" />
                                </span>
                              ) : (
                                <span title="Pendente">
                                  <Circle size={16} className="text-gray-300 mx-auto" />
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {!mov.conciliado ? (
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => onEdit(mov)} className="text-blue-600 hover:text-blue-800 p-1">
                                    <Edit size={16} />
                                  </button>
                                  <button onClick={() => onDelete(mov)} className="text-red-600 hover:text-red-800 p-1">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ) : null}
                            </td>
                          </motion.tr>
                        );
                      })}
                </React.Fragment>
              );
            })}
          </AnimatePresence>

          {dayGroups.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-gray-500">Nenhuma movimentação no período.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
