import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CarrierListItem } from '../../services/carriers';
import { Edit, Trash2, Truck, MapPin, Clock, Star } from 'lucide-react';
import { cnpjMask, cpfMask } from '../../lib/masks';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

interface CarriersTableProps {
  carriers: CarrierListItem[];
  onEdit: (carrier: CarrierListItem) => void;
  onDelete: (carrier: CarrierListItem) => void;
  sortBy: { column: keyof CarrierListItem; ascending: boolean };
  onSort: (column: keyof CarrierListItem) => void;
  selectedIds?: Set<string>;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

const CarriersTable: React.FC<CarriersTableProps> = ({
  carriers,
  onEdit,
  onDelete,
  sortBy,
  onSort,
  selectedIds,
  allSelected,
  someSelected,
  onToggleSelect,
  onToggleSelectAll,
}) => {
  const columns: TableColumnWidthDef[] = [
    ...(onToggleSelect ? [{ id: 'select', defaultWidth: 56, minWidth: 56, maxWidth: 56, resizable: false }] : []),
    { id: 'nome', defaultWidth: 340, minWidth: 220 },
    { id: 'documento', defaultWidth: 200, minWidth: 170 },
    { id: 'cidade', defaultWidth: 190, minWidth: 160 },
    { id: 'modal_principal', defaultWidth: 240, minWidth: 200 },
    { id: 'ativo', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 160, minWidth: 140 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'carriers:list', columns });
  const sort: SortState<string> = sortBy ? { column: sortBy.column, direction: sortBy.ascending ? 'asc' : 'desc' } : null;

  const formatDocument = (doc: string | null) => {
    if (!doc) return '-';
    if (doc.length <= 11) return cpfMask(doc);
    return cnpjMask(doc);
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1100px] w-full divide-y divide-gray-200 table-fixed">
        <TableColGroup columns={columns} widths={widths} />
        <thead className="bg-gray-50">
          <tr>
            {onToggleSelect ? (
              <th scope="col" className="px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={!!allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && !!someSelected;
                  }}
                  onChange={() => onToggleSelectAll?.()}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                />
              </th>
            ) : null}
            <ResizableSortableTh columnId="nome" label="Nome" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="documento" label="Documento" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="cidade" label="Localização" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="modal_principal" label="Logística" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="ativo" label="Status" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh
              columnId="acoes"
              label={<span className="sr-only">Ações</span>}
              sortable={false}
              onResizeStart={startResize}
              align="right"
              className="px-6"
            />
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {carriers.map((carrier) => (
              <motion.tr
                key={carrier.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="hover:bg-gray-50 transition-colors"
              >
                {onToggleSelect ? (
                  <td className="px-4 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${carrier.nome || 'transportadora'}`}
                      checked={!!selectedIds?.has(carrier.id)}
                      onChange={() => onToggleSelect(carrier.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                    />
                  </td>
                ) : null}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 relative">
                      <Truck size={20} />
                      {carrier.padrao_para_frete && (
                        <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-0.5 border border-white" title="Padrão">
                            <Star size={10} className="text-white fill-white" />
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{carrier.nome}</div>
                      {carrier.codigo && <div className="text-xs text-gray-500">Cód: {carrier.codigo}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {formatDocument(carrier.documento)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {carrier.cidade ? (
                    <div className="flex items-center gap-1">
                        <MapPin size={14} className="text-gray-400" />
                        {carrier.cidade}/{carrier.uf}
                    </div>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex flex-col gap-1">
                    <span className="capitalize font-medium">{carrier.modal_principal || '-'}</span>
                    {carrier.prazo_medio_dias && (
                        <span className="text-xs flex items-center gap-1 text-gray-400">
                            <Clock size={10} /> {carrier.prazo_medio_dias} dias
                        </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    carrier.ativo 
                      ? 'bg-green-100 text-green-800 border border-green-200' 
                      : 'bg-red-100 text-red-800 border border-red-200'
                  }`}>
                    {carrier.ativo ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-3">
                    <button 
                      onClick={() => onEdit(carrier)} 
                      className="text-indigo-600 hover:text-indigo-900 p-1.5 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>
                    <button 
                      onClick={() => onDelete(carrier)} 
                      className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-md transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </motion.tbody>
      </table>
    </div>
  );
};

export default CarriersTable;
