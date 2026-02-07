import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExtratoLancamento } from '@/services/extrato';
import { formatCurrency } from '@/lib/utils';
import { CheckCircle, ChevronDown, ChevronRight, Circle, Link2 } from 'lucide-react';
import ResizableSortableTh from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { formatDatePtBR } from '@/lib/dateDisplay';

interface Props {
  lancamentos: ExtratoLancamento[];
}

type ExtratoDayGroup = {
  dateISO: string; // YYYY-MM-DD
  items: ExtratoLancamento[];
  totalEntradas: number;
  totalSaidas: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getSignedAmount(item: ExtratoLancamento): number {
  const raw = Number(item.valor ?? 0);
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return raw;
  const abs = Math.abs(raw);
  return item.tipo_lancamento === 'debito' ? -abs : abs;
}

function getDelta(item: ExtratoLancamento): number {
  return getSignedAmount(item);
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

  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [allCollapsed, setAllCollapsed] = useState(false);
  const dayGroups = useMemo<ExtratoDayGroup[]>(() => {
    const groups: ExtratoDayGroup[] = [];

    for (const item of lancamentos) {
      const dateISO = String(item.data_lancamento || '').slice(0, 10);
      const signed = getSignedAmount(item);
      const last = groups.length > 0 ? groups[groups.length - 1] : undefined;
      if (!last || last.dateISO !== dateISO) {
        groups.push({
          dateISO,
          items: [item],
          totalEntradas: signed > 0 ? signed : 0,
          totalSaidas: signed < 0 ? Math.abs(signed) : 0,
          saldoInicial: null,
          saldoFinal: null,
        });
      } else {
        last.items.push(item);
        if (signed > 0) last.totalEntradas += signed;
        if (signed < 0) last.totalSaidas += Math.abs(signed);
      }
    }

    let prevSaldoFinal: number | null = null;
    for (const g of groups) {
      g.totalEntradas = round2(g.totalEntradas);
      g.totalSaidas = round2(g.totalSaidas);
      const net = round2(g.totalEntradas - g.totalSaidas);

      let saldoFinal: number | null = null;
      let lastSaldoIdx: number | null = null;
      for (let i = g.items.length - 1; i >= 0; i -= 1) {
        const s = g.items[i]?.saldo_apos_lancamento;
        if (s !== null && s !== undefined) {
          saldoFinal = Number(s);
          lastSaldoIdx = i;
          break;
        }
      }

      if (saldoFinal !== null && lastSaldoIdx !== null) {
        let deltaAfter = 0;
        for (let j = lastSaldoIdx + 1; j < g.items.length; j += 1) {
          deltaAfter += getDelta(g.items[j]);
        }
        saldoFinal = round2(saldoFinal + deltaAfter);
        g.saldoFinal = saldoFinal;
        g.saldoInicial = round2(saldoFinal - net);
        prevSaldoFinal = saldoFinal;
        continue;
      }

      if (prevSaldoFinal !== null) {
        g.saldoInicial = prevSaldoFinal;
        g.saldoFinal = round2(prevSaldoFinal + net);
        prevSaldoFinal = g.saldoFinal;
        continue;
      }

      g.saldoInicial = null;
      g.saldoFinal = null;
    }

    return groups;
  }, [lancamentos]);

  const effectiveSaldoById = useMemo(() => {
    const saldoMap: Record<string, number | null> = {};

    for (const g of dayGroups) {
      let running = g.saldoInicial;
      for (const item of g.items) {
        const saldoItem = item.saldo_apos_lancamento;
        if (saldoItem !== null && saldoItem !== undefined) {
          const normalized = round2(Number(saldoItem));
          saldoMap[item.id] = normalized;
          running = normalized;
          continue;
        }

        if (running !== null) {
          running = round2(running + getDelta(item));
          saldoMap[item.id] = running;
        } else {
          saldoMap[item.id] = null;
        }
      }
    }

    return saldoMap;
  }, [dayGroups]);

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
              columnId="conta"
              label="Conta"
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
              columnId="valor"
              label="Valor"
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
              columnId="conc"
              label="Conc."
              align="center"
              sortable={false}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="vinculo"
              label="Vínculo"
              sortable={false}
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
                            Entradas: <span className="font-semibold">{formatCurrency(g.totalEntradas * 100)}</span>
                          </div>
                          <div className="text-red-700">
                            Saídas: <span className="font-semibold">{formatCurrency(g.totalSaidas * 100)}</span>
                          </div>
                          <div className="text-gray-700">
                            Saldo inicial:{' '}
                            <span className="font-semibold">
                              {g.saldoInicial !== null ? formatCurrency(g.saldoInicial * 100) : '—'}
                            </span>
                          </div>
                          <div className="text-gray-900">
                            Saldo final:{' '}
                            <span className="font-semibold">
                              {g.saldoFinal !== null ? formatCurrency(g.saldoFinal * 100) : '—'}
                            </span>
                          </div>
                        </div>
                      </button>
                    </td>
                  </motion.tr>

                  {isCollapsed
                    ? null
                    : g.items.map((item) => (
                        <motion.tr
                          key={item.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDatePtBR(item.data_lancamento)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.conta_nome}</td>
                          <td className="px-6 py-4 text-sm text-gray-800">
                            <div className="font-medium">{item.descricao}</div>
                            {item.documento_ref ? <div className="text-xs text-gray-500">Doc: {item.documento_ref}</div> : null}
                          </td>
                          <td
                            className={`px-6 py-4 text-right text-sm font-bold ${item.tipo_lancamento === 'credito' ? 'text-green-600' : 'text-red-600'}`}
                          >
                            {getSignedAmount(item) >= 0 ? '+' : '-'}
                            {formatCurrency(Math.abs(Number(item.valor ?? 0)) * 100)}
                          </td>
                          <td className="px-6 py-4 text-right text-sm text-gray-700">
                            {effectiveSaldoById[item.id] !== null && effectiveSaldoById[item.id] !== undefined
                              ? formatCurrency((effectiveSaldoById[item.id] as number) * 100)
                              : '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {item.conciliado ? (
                              <span title="Conciliado">
                                <CheckCircle size={16} className="text-green-500 mx-auto" />
                              </span>
                            ) : (
                              <span title="Pendente">
                                <Circle size={16} className="text-gray-300 mx-auto" />
                              </span>
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
                </React.Fragment>
              );
            })}
          </AnimatePresence>
          {dayGroups.length === 0 && (
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
