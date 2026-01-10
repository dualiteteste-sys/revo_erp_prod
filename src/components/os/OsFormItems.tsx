import React, { useMemo } from 'react';
import { OrdemServicoItem, OsItemSearchResult } from '@/services/os';
import { Trash2, Wrench, Package } from 'lucide-react';
import Section from '../ui/forms/Section';
import { motion, AnimatePresence } from 'framer-motion';
import ItemAutocomplete from './ItemAutocomplete';
import ResizableSortableTh from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

interface OsFormItemsProps {
  items: OrdemServicoItem[];
  onRemoveItem: (itemId: string) => void;
  onAddItem: (item: OsItemSearchResult) => void;
  isAddingItem: boolean;
  readOnly?: boolean;
}

const ItemRow: React.FC<{
  item: OrdemServicoItem;
  onRemove: (itemId: string) => void;
  readOnly?: boolean;
}> = ({ item, onRemove, readOnly = false }) => {
  
  const total = (item.quantidade || 0) * (item.preco || 0) * (1 - (item.desconto_pct || 0) / 100);
  const isService = !!item.servico_id;

  return (
    <motion.tr 
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="hover:bg-gray-50"
    >
      <td className="px-2 py-2 align-middle">
        <div className="flex items-center gap-2">
            {isService ? <Wrench size={16} className="text-gray-400" /> : <Package size={16} className="text-gray-400" />}
            <span className="font-medium">{item.descricao}</span>
        </div>
      </td>
      <td className="px-2 py-2 align-middle text-center">{item.quantidade}</td>
      <td className="px-2 py-2 align-middle text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.preco || 0)}</td>
      <td className="px-2 py-2 align-middle text-right">{item.desconto_pct || 0}%</td>
      <td className="px-2 py-2 align-middle text-right font-semibold">
        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
      </td>
      <td className="px-2 py-2 align-middle text-center">
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={readOnly}
          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-red-500"
        >
          <Trash2 size={16} />
        </button>
      </td>
    </motion.tr>
  );
};

const OsFormItems: React.FC<OsFormItemsProps> = ({ items, onRemoveItem, onAddItem, isAddingItem, readOnly = false }) => {
  const columns = useMemo<TableColumnWidthDef[]>(
    () => [
      { id: 'descricao', defaultWidth: 520, minWidth: 220 },
      { id: 'qtd', defaultWidth: 120, minWidth: 90 },
      { id: 'preco', defaultWidth: 160, minWidth: 120 },
      { id: 'desc', defaultWidth: 120, minWidth: 100 },
      { id: 'total', defaultWidth: 160, minWidth: 120 },
      { id: 'acoes', defaultWidth: 80, minWidth: 64 },
    ],
    []
  );
  const { widths, startResize } = useTableColumnWidths({ tableId: 'os:itens', columns });

  return (
    <Section title="Itens da Ordem de Serviço" description="Adicione os produtos e serviços que compõem esta O.S.">
        <div className="sm:col-span-6">
            <ItemAutocomplete onSelect={onAddItem} disabled={isAddingItem || readOnly} />
            <div className="mt-4 overflow-x-auto">
                <table className="min-w-full table-fixed">
                    <TableColGroup columns={columns} widths={widths} />
                    <thead className="border-b border-gray-200">
                        <tr>
                            <ResizableSortableTh
                              columnId="descricao"
                              label="Descrição"
                              className="px-2 py-2 text-left text-sm font-medium text-gray-600"
                              sortable={false}
                              resizable
                              onResizeStart={startResize}
                            />
                            <ResizableSortableTh
                              columnId="qtd"
                              label="Qtd."
                              align="center"
                              className="px-2 py-2 text-sm font-medium text-gray-600"
                              sortable={false}
                              resizable
                              onResizeStart={startResize}
                            />
                            <ResizableSortableTh
                              columnId="preco"
                              label="Preço Unit."
                              align="right"
                              className="px-2 py-2 text-sm font-medium text-gray-600"
                              sortable={false}
                              resizable
                              onResizeStart={startResize}
                            />
                            <ResizableSortableTh
                              columnId="desc"
                              label="Desc. %"
                              align="right"
                              className="px-2 py-2 text-sm font-medium text-gray-600"
                              sortable={false}
                              resizable
                              onResizeStart={startResize}
                            />
                            <ResizableSortableTh
                              columnId="total"
                              label="Total"
                              align="right"
                              className="px-2 py-2 text-sm font-medium text-gray-600"
                              sortable={false}
                              resizable
                              onResizeStart={startResize}
                            />
                            <ResizableSortableTh
                              columnId="acoes"
                              label=""
                              className="px-2 py-2"
                              sortable={false}
                              resizable
                              onResizeStart={startResize}
                            />
                        </tr>
                    </thead>
                    <tbody>
                        <AnimatePresence>
                            {items.map((item) => (
                                <ItemRow key={item.id} item={item} onRemove={onRemoveItem} readOnly={readOnly} />
                            ))}
                        </AnimatePresence>
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-gray-500">
                                    Nenhum item adicionado.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </Section>
  );
};

export default OsFormItems;
