import React, { useMemo, useState } from 'react';
import { ExtratoItem } from '@/services/treasury';
import { Link2, Unlink, AlertCircle, Loader2, EyeOff, Eye } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { formatDatePtBR } from '@/lib/dateDisplay';

interface Props {
  extratos: ExtratoItem[];
  onConciliate: (item: ExtratoItem) => void;
  onUnconciliate: (item: ExtratoItem) => void;
  onIgnore?: (item: ExtratoItem) => void;
  onUnignore?: (item: ExtratoItem) => void;
  busyExtratoId?: string | null;
  transferAssistByExtratoId?: Record<
    string,
    {
      kind: 'detected_unique' | 'detected_multiple' | 'conciliated_transfer';
      movimentacaoId?: string;
      candidatesCount?: number;
    }
  >;
  onQuickLinkTransfer?: (item: ExtratoItem, movimentacaoId: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export default function ExtratosTable({
  extratos,
  onConciliate,
  onUnconciliate,
  onIgnore,
  onUnignore,
  busyExtratoId,
  transferAssistByExtratoId,
  onQuickLinkTransfer,
  selectedIds,
  onToggleSelect,
}: Props) {
  const hasSelection = !!selectedIds && !!onToggleSelect;
  const columns: TableColumnWidthDef[] = [
    ...(hasSelection ? [{ id: 'sel', defaultWidth: 44, minWidth: 40 }] : []),
    { id: 'data', defaultWidth: 160, minWidth: 140 },
    { id: 'descricao', defaultWidth: 420, minWidth: 220 },
    { id: 'valor', defaultWidth: 160, minWidth: 140 },
    { id: 'vinculo', defaultWidth: 420, minWidth: 240 },
    { id: 'acoes', defaultWidth: 200, minWidth: 180 },
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
          getValue: (e) => (e.conciliado ? `2:${e.movimentacao_descricao ?? ''}` : e.ignorado ? `1:ignorado` : `0:${e.descricao ?? ''}`),
          compare: (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' }),
        },
      ] as const
    );
  }, [extratos, sort]);

  const colCount = columns.length;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            {hasSelection && (
              <th className="w-11 px-3 py-3" />
            )}
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
          {sortedExtratos.map(item => {
            const isBusy = !!busyExtratoId && busyExtratoId === item.id;
            const transferAssist = transferAssistByExtratoId?.[item.id];
            const isPending = !item.conciliado && !item.ignorado;
            const hasQuickTransferAction =
              isPending &&
              transferAssist?.kind === 'detected_unique' &&
              !!transferAssist.movimentacaoId &&
              !!onQuickLinkTransfer;

            const rowBg = item.conciliado
              ? 'bg-green-50/30'
              : item.ignorado
                ? 'bg-amber-50/30 opacity-60'
                : '';

            return (
              <tr key={item.id} className={`hover:bg-gray-50 ${rowBg}`}>
                {hasSelection && (
                  <td className="px-3 py-4 text-center">
                    {isPending ? (
                      <input
                        type="checkbox"
                        checked={selectedIds!.has(item.id)}
                        onChange={() => onToggleSelect!(item.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    ) : null}
                  </td>
                )}
                <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                  {formatDatePtBR(item.data_lancamento)}
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
                        {formatDatePtBR(item.movimentacao_data)} • R${' '}
                        {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(item.movimentacao_valor!)}
                      </span>
                      {transferAssist?.kind === 'conciliated_transfer' ? (
                        <span className="mt-1 inline-flex w-fit items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Conciliado por transferência interna
                        </span>
                      ) : null}
                    </div>
                  ) : item.ignorado ? (
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        <EyeOff size={12} className="mr-1" /> Ignorado
                      </span>
                      {item.motivo_ignorado && (
                        <span className="text-xs text-gray-400 italic">{item.motivo_ignorado}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span className="text-gray-400 text-xs italic">Pendente</span>
                      {transferAssist?.kind === 'detected_unique' ? (
                        <span className="inline-flex w-fit items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                          Transferência interna detectada
                        </span>
                      ) : null}
                      {transferAssist?.kind === 'detected_multiple' ? (
                        <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Transferência interna detectada ({transferAssist.candidatesCount ?? 2} opções)
                        </span>
                      ) : null}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  {item.conciliado ? (
                    <button
                      onClick={() => (isBusy ? undefined : onUnconciliate(item))}
                      disabled={isBusy}
                      className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      title="Reverter conciliação"
                    >
                      {isBusy ? <Loader2 className="animate-spin" size={18} /> : <Unlink size={18} />}
                      <span className="text-xs font-semibold">Desfazer</span>
                    </button>
                  ) : item.ignorado ? (
                    onUnignore ? (
                      <button
                        onClick={() => (isBusy ? undefined : onUnignore(item))}
                        disabled={isBusy}
                        className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1"
                        title="Restaurar (desfazer ignorar)"
                      >
                        {isBusy ? <Loader2 className="animate-spin" size={18} /> : <Eye size={18} />}
                        <span className="text-xs font-semibold">Restaurar</span>
                      </button>
                    ) : null
                  ) : (
                    <div className="flex items-center justify-center gap-1">
                      {hasQuickTransferAction ? (
                        <button
                          onClick={() => (isBusy ? undefined : onQuickLinkTransfer(item, transferAssist!.movimentacaoId!))}
                          disabled={isBusy}
                          className="text-emerald-700 hover:text-emerald-800 p-1.5 rounded-full hover:bg-emerald-50 transition-colors flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Vincular transferência detectada"
                        >
                          {isBusy ? <Loader2 className="animate-spin" size={16} /> : <Link2 size={16} />}
                          <span className="text-xs font-semibold">Transf.</span>
                        </button>
                      ) : null}
                      <button
                        onClick={() => (isBusy ? undefined : onConciliate(item))}
                        disabled={isBusy}
                        className="text-blue-600 hover:text-blue-800 p-1.5 rounded-full hover:bg-blue-50 transition-colors flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Conciliar"
                      >
                        {isBusy ? <Loader2 className="animate-spin" size={16} /> : <Link2 size={16} />}
                        <span className="text-xs font-semibold">{hasQuickTransferAction ? 'Revisar' : 'Conciliar'}</span>
                      </button>
                      {onIgnore ? (
                        <button
                          onClick={() => (isBusy ? undefined : onIgnore(item))}
                          disabled={isBusy}
                          className="text-amber-600 hover:text-amber-800 p-1.5 rounded-full hover:bg-amber-50 transition-colors flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Ignorar este lançamento"
                        >
                          {isBusy ? <Loader2 className="animate-spin" size={16} /> : <EyeOff size={16} />}
                          <span className="text-xs font-semibold">Ignorar</span>
                        </button>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {sortedExtratos.length === 0 && (
            <tr>
              <td colSpan={colCount} className="px-6 py-12 text-center text-gray-500">
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
