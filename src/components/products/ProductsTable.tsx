import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../../services/products';
import { Edit, Trash2, ArrowUpDown, Copy } from 'lucide-react';

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

const SortableHeader: React.FC<{
  column: keyof Product;
  label: string;
  sortBy: { column: keyof Product; ascending: boolean };
  onSort: (column: keyof Product) => void;
}> = ({ column, label, sortBy, onSort }) => {
  const isSorted = sortBy.column === column;
  return (
    <th
      scope="col"
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-2">
        {label}
        {isSorted && <ArrowUpDown size={14} className={sortBy.ascending ? '' : 'rotate-180'} />}
      </div>
    </th>
  );
};

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
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
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
            <SortableHeader column="nome" label="Nome" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="sku" label="SKU" sortBy={sortBy} onSort={onSort} />
            <SortableHeader column="preco_venda" label="Preço" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidade</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th scope="col" className="relative px-6 py-3">
              <span className="sr-only">Ações</span>
            </th>
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
