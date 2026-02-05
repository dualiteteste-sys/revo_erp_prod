import React, { useMemo, useState } from 'react';
import { ContaCorrente } from '@/services/treasury';
import { Edit, Trash2, Wallet, Landmark, CreditCard, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import { useDeferredAction } from '@/components/ui/hooks/useDeferredAction';

interface Props {
  contas: ContaCorrente[];
  onEdit: (conta: ContaCorrente) => void;
  onDelete: (conta: ContaCorrente) => void;
  onSetPadrao: (conta: ContaCorrente, para: 'pagamentos' | 'recebimentos') => void;
}

const getIcon = (tipo: string) => {
  switch (tipo) {
    case 'caixa': return <Wallet size={20} className="text-green-600" />;
    case 'carteira': return <CreditCard size={20} className="text-purple-600" />;
    default: return <Landmark size={20} className="text-blue-600" />;
  }
};

export default function ContasCorrentesTable({ contas, onEdit, onDelete, onSetPadrao }: Props) {
  const { schedule: scheduleEdit, cancel: cancelScheduledEdit } = useDeferredAction(180);

  const columns: TableColumnWidthDef[] = [
    { id: 'nome_banco', defaultWidth: 420, minWidth: 220 },
    { id: 'agencia_conta', defaultWidth: 320, minWidth: 200 },
    { id: 'padroes', defaultWidth: 320, minWidth: 240 },
    { id: 'saldo_atual', defaultWidth: 180, minWidth: 160 },
    { id: 'ativo', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 120, minWidth: 90, maxWidth: 180 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'financeiro:tesouraria:contas', columns });

  const [sort, setSort] = useState<SortState<string>>({ column: 'nome_banco', direction: 'asc' });
  const sortedContas = useMemo(() => {
    return sortRows(
      contas,
      sort as any,
      [
        { id: 'nome_banco', type: 'string', getValue: (c) => c.nome ?? '' },
        {
          id: 'agencia_conta',
          type: 'string',
          getValue: (c) =>
            c.tipo_conta === 'caixa' ? '' : `Ag ${c.agencia ?? ''} CC ${c.conta ?? ''}-${c.digito ?? ''} ${c.banco_nome ?? ''}`,
        },
        {
          id: 'padroes',
          type: 'number',
          getValue: (c) => Number(Boolean(c.padrao_para_recebimentos)) + Number(Boolean(c.padrao_para_pagamentos)),
        },
        { id: 'saldo_atual', type: 'number', getValue: (c) => c.saldo_atual ?? 0 },
        { id: 'ativo', type: 'boolean', getValue: (c) => Boolean(c.ativo) },
      ] as const
    );
  }, [contas, sort]);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            <ResizableSortableTh
              columnId="nome_banco"
              label="Nome / Banco"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="agencia_conta"
              label="Agência / Conta"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="padroes"
              label="Padrões"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="saldo_atual"
              label="Saldo Atual"
              align="right"
              sort={sort as any}
              onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
              onResizeStart={startResize as any}
            />
            <ResizableSortableTh
              columnId="ativo"
              label="Status"
              align="center"
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
          {sortedContas.map(conta => (
            <tr
              key={conta.id}
              className="hover:bg-gray-50"
              onDoubleClick={(e) => {
                if (shouldIgnoreRowDoubleClickEvent(e)) return;
                const href = `/app/financeiro/tesouraria?tab=contas&open=${encodeURIComponent(conta.id)}`;
                openInNewTabBestEffort(href, () => onEdit(conta));
              }}
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    {getIcon(conta.tipo_conta)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      <a
                        href={`/app/financeiro/tesouraria?tab=contas&open=${encodeURIComponent(conta.id)}`}
                        className="hover:underline underline-offset-2"
                        onClick={(e) => {
                          if (!isPlainLeftClick(e)) return;
                          e.preventDefault();
                          scheduleEdit(() => onEdit(conta));
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          cancelScheduledEdit();
                          openInNewTabBestEffort(`/app/financeiro/tesouraria?tab=contas&open=${encodeURIComponent(conta.id)}`, () => onEdit(conta));
                        }}
                      >
                        {conta.nome}
                      </a>
                    </div>
                    <div className="text-xs text-gray-500 capitalize">{conta.tipo_conta}</div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {conta.tipo_conta === 'caixa' ? '-' : (
                    <>
                        Ag: {conta.agencia || '-'} / CC: {conta.conta || '-'}-{conta.digito || ''}
                        <div className="text-xs text-gray-400">{conta.banco_nome}</div>
                    </>
                )}
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {conta.padrao_para_recebimentos ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                      <ArrowDownToLine size={14} />
                      Recebimentos
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => onSetPadrao(conta, 'recebimentos')}
                      title="Definir como padrão para recebimentos"
                    >
                      <ArrowDownToLine size={14} />
                      Padrão receb.
                    </Button>
                  )}
                  {conta.padrao_para_pagamentos ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700">
                      <ArrowUpFromLine size={14} />
                      Pagamentos
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => onSetPadrao(conta, 'pagamentos')}
                      title="Definir como padrão para pagamentos"
                    >
                      <ArrowUpFromLine size={14} />
                      Padrão pag.
                    </Button>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 text-right">
                <span className={`font-semibold ${conta.saldo_atual && conta.saldo_atual < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: conta.moeda }).format(conta.saldo_atual || 0)}
                </span>
              </td>
              <td className="px-6 py-4 text-center">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${conta.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {conta.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onEdit(conta)} className="text-blue-600 hover:text-blue-800 p-1">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => onDelete(conta)} className="text-red-600 hover:text-red-800 p-1">
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {sortedContas.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhuma conta cadastrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
