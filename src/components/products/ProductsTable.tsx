import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../../services/products';
import { Edit, Trash2, Copy } from 'lucide-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

interface ProductsTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onClone: (product: Product) => void;
  sortBy: { column: keyof Product; ascending: boolean };
  onSort: (column: keyof Product) => void;
  selectedIds?: Set<string>;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

const ProductsTable: React.FC<ProductsTableProps> = ({
  products,
  onEdit,
  onDelete,
  onClone,
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
    { id: 'nome', defaultWidth: 360, minWidth: 220 },
    { id: 'sku', defaultWidth: 160, minWidth: 120 },
    { id: 'preco_venda', defaultWidth: 160, minWidth: 140 },
    { id: 'unidade', defaultWidth: 140, minWidth: 110 },
    { id: 'status', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 160, minWidth: 120 },
  ];

  const { widths, startResize } = useTableColumnWidths({ tableId: 'products:list', columns });

  const sort: SortState<string> = sortBy
    ? { column: sortBy.column, direction: sortBy.ascending ? 'asc' : 'desc' }
    : null;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[980px] w-full divide-y divide-gray-200 table-fixed">
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
            <ResizableSortableTh columnId="sku" label="SKU" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="preco_venda" label="Preço" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="unidade" label="Unidade" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh columnId="status" label="Status" sort={sort} onSort={onSort as any} onResizeStart={startResize} />
            <ResizableSortableTh
              columnId="acoes"
              label={<span className="sr-only">Ações</span>}
              sortable={false}
              resizable
              onResizeStart={startResize}
              align="right"
              className="px-6"
            />
          </tr>
        </thead>
        <motion.tbody layout className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {products.map((product) => (
              <motion.tr
                key={product.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="hover:bg-gray-50"
              >
                {onToggleSelect ? (
                  <td className="px-4 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${product.nome || 'produto'}`}
                      checked={!!selectedIds?.has(product.id)}
                      onChange={() => onToggleSelect(product.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                    />
                  </td>
                ) : null}
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.nome}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.sku}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.preco_venda ?? 0)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.unidade}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      product.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {product.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-4">
                    <button onClick={() => onClone(product)} className="text-blue-600 hover:text-blue-900" title="Clonar produto">
                      <Copy size={18} />
                    </button>
                    <button onClick={() => onEdit(product)} className="text-indigo-600 hover:text-indigo-900" title="Editar produto">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => onDelete(product)} className="text-red-600 hover:text-red-900" title="Excluir produto">
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

export default ProductsTable;
