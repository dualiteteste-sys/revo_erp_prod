import React from 'react';
import { OrdemComponente } from '@/services/industria';
import { Trash2, Package } from 'lucide-react';
import Section from '@/components/ui/forms/Section';
import { motion, AnimatePresence } from 'framer-motion';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { OsItemSearchResult } from '@/services/os';

interface OrdemFormItemsProps {
  items: OrdemComponente[];
  onRemoveItem: (itemId: string) => void;
  onAddItem: (item: OsItemSearchResult) => void;
  onUpdateItem: (itemId: string, field: string, value: any) => void;
  isAddingItem: boolean;
  readOnly?: boolean;
}

const ItemRow: React.FC<{
  item: OrdemComponente;
  onRemove: (itemId: string) => void;
  onUpdate: (itemId: string, field: string, value: any) => void;
  readOnly?: boolean;
}> = ({ item, onRemove, onUpdate, readOnly }) => {
  return (
    <motion.tr 
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="hover:bg-gray-50"
    >
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-2">
            <Package size={16} className="text-gray-400" />
            <span className="font-medium text-gray-700">{item.produto_nome}</span>
        </div>
      </td>
      <td className="px-3 py-3 align-middle w-32">
        <input
            type="number"
            value={item.quantidade_planejada}
            onChange={(e) => onUpdate(item.id, 'quantidade_planejada', parseFloat(e.target.value))}
            disabled={readOnly}
            className="w-full p-1 border border-gray-300 rounded text-right focus:ring-blue-500 focus:border-blue-500"
            min="0"
            step="0.0001"
        />
      </td>
      <td className="px-3 py-3 align-middle w-24 text-center text-sm text-gray-500">
        {item.unidade}
      </td>
      <td className="px-3 py-3 align-middle w-32 text-right text-sm text-gray-600">
        {item.quantidade_consumida}
      </td>
      {!readOnly && (
        <td className="px-3 py-3 align-middle text-center w-16">
            <button type="button" onClick={() => onRemove(item.id)} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full transition-colors">
            <Trash2 size={16} />
            </button>
        </td>
      )}
    </motion.tr>
  );
};

const OrdemFormItems: React.FC<OrdemFormItemsProps> = ({ items, onRemoveItem, onAddItem, onUpdateItem, isAddingItem, readOnly }) => {
  return (
    <Section title="Insumos / Componentes (BOM)" description="Lista de materiais necessários para esta ordem.">
        <div className="sm:col-span-6">
            {!readOnly && (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adicionar Componente</label>
                    <ItemAutocomplete onSelect={onAddItem} disabled={isAddingItem} />
                </div>
            )}
            
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qtd. Planejada</th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Un.</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Consumido</th>
                            {!readOnly && <th className="px-3 py-3"></th>}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        <AnimatePresence>
                            {items.map((item) => (
                                <ItemRow 
                                    key={item.id} 
                                    item={item} 
                                    onRemove={onRemoveItem} 
                                    onUpdate={onUpdateItem}
                                    readOnly={readOnly}
                                />
                            ))}
                        </AnimatePresence>
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={readOnly ? 4 : 5} className="text-center py-8 text-gray-500">
                                    Nenhum componente adicionado.
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

export default OrdemFormItems;
