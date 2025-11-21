import React from 'react';
import { OrdemServicoItem, OsItemSearchResult } from '@/services/os';
import { Trash2, Wrench, Package } from 'lucide-react';
import Section from '../ui/forms/Section';
import { motion, AnimatePresence } from 'framer-motion';
import ItemAutocomplete from './ItemAutocomplete';

interface OsFormItemsProps {
  items: OrdemServicoItem[];
  onRemoveItem: (itemId: string) => void;
  onAddItem: (item: OsItemSearchResult) => void;
  isAddingItem: boolean;
}

const ItemRow: React.FC<{
  item: OrdemServicoItem;
  onRemove: (itemId: string) => void;
}> = ({ item, onRemove }) => {
  
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
      <td className="px-2 py-2 align-middle w-24 text-center">{item.quantidade}</td>
      <td className="px-2 py-2 align-middle w-32 text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.preco || 0)}</td>
      <td className="px-2 py-2 align-middle w-28 text-right">{item.desconto_pct || 0}%</td>
      <td className="px-2 py-2 align-middle text-right w-32 font-semibold">
        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
      </td>
      <td className="px-2 py-2 align-middle text-center w-16">
        <button type="button" onClick={() => onRemove(item.id)} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full">
          <Trash2 size={16} />
        </button>
      </td>
    </motion.tr>
  );
};

const OsFormItems: React.FC<OsFormItemsProps> = ({ items, onRemoveItem, onAddItem, isAddingItem }) => {
  return (
    <Section title="Itens da Ordem de Serviço" description="Adicione os produtos e serviços que compõem esta O.S.">
        <div className="sm:col-span-6">
            <ItemAutocomplete onSelect={onAddItem} disabled={isAddingItem} />
            <div className="mt-4 overflow-x-auto">
                <table className="min-w-full">
                    <thead className="border-b border-gray-200">
                        <tr>
                            <th className="px-2 py-2 text-left text-sm font-medium text-gray-600">Descrição</th>
                            <th className="px-2 py-2 text-center text-sm font-medium text-gray-600">Qtd.</th>
                            <th className="px-2 py-2 text-right text-sm font-medium text-gray-600">Preço Unit.</th>
                            <th className="px-2 py-2 text-right text-sm font-medium text-gray-600">Desc. %</th>
                            <th className="px-2 py-2 text-right text-sm font-medium text-gray-600">Total</th>
                            <th className="px-2 py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <AnimatePresence>
                            {items.map((item) => (
                                <ItemRow key={item.id} item={item} onRemove={onRemoveItem} />
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
