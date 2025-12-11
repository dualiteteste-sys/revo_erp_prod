import React, { useState } from 'react';
import { OrdemComponente } from '@/services/industria';
import { Trash2, Package, Archive, CheckCircle2 } from 'lucide-react';
import Section from '@/components/ui/forms/Section';
import { motion, AnimatePresence } from 'framer-motion';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { OsItemSearchResult } from '@/services/os';
import ReservaLotesModal from '@/components/industria/estoque/ReservaLotesModal';
import ConsumoItemModal from '@/components/industria/estoque/ConsumoItemModal';

interface OrdemFormItemsProps {
  ordemId?: string; // Add ordemId to props to pass to modals
  items: OrdemComponente[];
  onRemoveItem: (itemId: string) => void;
  onAddItem: (item: OsItemSearchResult) => void;
  onUpdateItem: (itemId: string, field: string, value: any) => void;
  onRefresh?: () => void; // Callback to refresh data after stock actions
  isAddingItem: boolean;
  readOnly?: boolean;
}

const ItemRow: React.FC<{
  item: OrdemComponente;
  ordemId?: string;
  onRemove: (itemId: string) => void;
  onUpdate: (itemId: string, field: string, value: any) => void;
  readOnly?: boolean;
  onOpenReserva: (item: OrdemComponente) => void;
  onOpenConsumo: (item: OrdemComponente) => void;
}> = ({ item, ordemId, onRemove, onUpdate, readOnly, onOpenReserva, onOpenConsumo }) => {
  const quantityNeeded = item.quantidade_planejada - (item.quantidade_reservada || 0);

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
          <div>
            <span className="font-medium text-gray-700 block">{item.produto_nome}</span>
            {ordemId && (
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => onOpenReserva(item)}
                  className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800"
                >
                  <Archive size={12} /> Reservar
                </button>
                <button
                  type="button"
                  onClick={() => onOpenConsumo(item)}
                  className="text-xs flex items-center gap-1 text-green-600 hover:text-green-800"
                >
                  <CheckCircle2 size={12} /> Consumir
                </button>
              </div>
            )}
          </div>
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
        {item.perda_percentual ? `${item.perda_percentual}%` : '-'}
      </td>
      <td className="px-3 py-3 align-middle w-24 text-center text-sm text-gray-500">
        {item.unidade}
      </td>
      <td className="px-3 py-3 align-middle w-28 text-right text-sm">
        <span className={quantityNeeded > 0 ? "text-orange-600 font-medium" : "text-green-600"}>
          {item.quantidade_reservada || 0}
        </span>
      </td>
      <td className="px-3 py-3 align-middle w-28 text-right text-sm text-gray-600">
        {item.quantidade_consumida || 0}
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

const OrdemFormItems: React.FC<OrdemFormItemsProps> = ({ items, ordemId, onRemoveItem, onAddItem, onUpdateItem, onRefresh, isAddingItem, readOnly }) => {
  const [reservaModalOpen, setReservaModalOpen] = useState(false);
  const [consumoModalOpen, setConsumoModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrdemComponente | null>(null);

  const handleOpenReserva = (item: OrdemComponente) => {
    setSelectedItem(item);
    setReservaModalOpen(true);
  };

  const handleOpenConsumo = (item: OrdemComponente) => {
    setSelectedItem(item);
    setConsumoModalOpen(true);
  };

  const handleSuccess = () => {
    if (onRefresh) onRefresh();
  };

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
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Perda %</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Un.</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Reservado</th>
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
                    ordemId={ordemId}
                    onRemove={onRemoveItem}
                    onUpdate={onUpdateItem}
                    readOnly={readOnly}
                    onOpenReserva={handleOpenReserva}
                    onOpenConsumo={handleOpenConsumo}
                  />
                ))}
              </AnimatePresence>
              {items.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 6 : 7} className="text-center py-8 text-gray-500">
                    Nenhum componente adicionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedItem && ordemId && (
        <>
          <ReservaLotesModal
            isOpen={reservaModalOpen}
            onClose={() => setReservaModalOpen(false)}
            ordemId={ordemId}
            componenteId={selectedItem.id}
            produtoId={selectedItem.produto_id}
            produtoNome={selectedItem.produto_nome}
            quantidadeNecessaria={Math.max(0, selectedItem.quantidade_planejada - (selectedItem.quantidade_reservada || 0))}
            onSuccess={handleSuccess}
          />
          <ConsumoItemModal
            isOpen={consumoModalOpen}
            onClose={() => setConsumoModalOpen(false)}
            ordemId={ordemId}
            componenteId={selectedItem.id}
            produtoId={selectedItem.produto_id}
            produtoNome={selectedItem.produto_nome}
            onSuccess={handleSuccess}
          />
        </>
      )}
    </Section>
  );
};

export default OrdemFormItems;
