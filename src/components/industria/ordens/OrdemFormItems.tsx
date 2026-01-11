import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OrdemComponente } from '@/services/industria';
import { Trash2, Package, Archive, CheckCircle2 } from 'lucide-react';
import Section from '@/components/ui/forms/Section';
import { motion, AnimatePresence } from 'framer-motion';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { OsItemSearchResult } from '@/services/os';
import ReservaLotesModal from '@/components/industria/estoque/ReservaLotesModal';
import ConsumoItemModal from '@/components/industria/estoque/ConsumoItemModal';
import ResizableSortableTh from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

interface OrdemFormItemsProps {
  ordemId?: string; // Add ordemId to props to pass to modals
  items: OrdemComponente[];
  onRemoveItem: (itemId: string) => void;
  onAddItem: (item: OsItemSearchResult) => void;
  onUpdateItem: (itemId: string, field: string, value: any) => void;
  onRefresh?: () => void; // Callback to refresh data after stock actions
  isAddingItem: boolean;
  readOnly?: boolean;
  highlightItemId?: string | null;
}

const OrdemFormItems: React.FC<OrdemFormItemsProps> = ({ items, ordemId, onRemoveItem, onAddItem, onUpdateItem, onRefresh, isAddingItem, readOnly, highlightItemId }) => {
  const [reservaModalOpen, setReservaModalOpen] = useState(false);
  const [consumoModalOpen, setConsumoModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrdemComponente | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const columns: TableColumnWidthDef[] = [
    { id: 'produto', defaultWidth: 360, minWidth: 240 },
    { id: 'qtd', defaultWidth: 160, minWidth: 140 },
    { id: 'perda', defaultWidth: 120, minWidth: 110 },
    { id: 'un', defaultWidth: 100, minWidth: 90 },
    { id: 'reservado', defaultWidth: 140, minWidth: 120 },
    { id: 'consumido', defaultWidth: 140, minWidth: 120 },
    { id: 'acoes', defaultWidth: 80, minWidth: 70, resizable: false },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: `industria:ordem:itens:${ordemId ?? 'new'}`, columns });

  const activeHighlight = useMemo(() => {
    if (!highlightItemId) return null;
    return items.some((i) => i.id === highlightItemId) ? highlightItemId : null;
  }, [highlightItemId, items]);

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

  useEffect(() => {
    if (!activeHighlight) return;
    const el = containerRef.current?.querySelector(`[data-componente-id="${activeHighlight}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeHighlight]);

  return (
    <Section title="Insumos / Componentes (BOM)" description="Lista de materiais necessários para esta ordem.">
      <div className="sm:col-span-6">
        {!readOnly && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Adicionar Componente</label>
            <ItemAutocomplete onSelect={onAddItem} disabled={isAddingItem} />
          </div>
        )}

        <div ref={containerRef} className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <TableColGroup columns={columns} widths={widths} />
            <thead className="bg-gray-50">
              <tr>
                <ResizableSortableTh columnId="produto" label="Produto" sortable={false} onResizeStart={startResize} className="px-3 py-3" />
                <ResizableSortableTh columnId="qtd" label="Qtd. Planejada" sortable={false} onResizeStart={startResize} align="right" className="px-3 py-3" />
                <ResizableSortableTh columnId="perda" label="Perda %" sortable={false} onResizeStart={startResize} align="center" className="px-3 py-3" />
                <ResizableSortableTh columnId="un" label="Un." sortable={false} onResizeStart={startResize} align="center" className="px-3 py-3" />
                <ResizableSortableTh columnId="reservado" label="Reservado" sortable={false} onResizeStart={startResize} align="right" className="px-3 py-3" />
                <ResizableSortableTh columnId="consumido" label="Consumido" sortable={false} onResizeStart={startResize} align="right" className="px-3 py-3" />
                {!readOnly && <ResizableSortableTh columnId="acoes" label="" sortable={false} onResizeStart={startResize} className="px-3 py-3" />}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.tr
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    data-componente-id={item.id}
                    className={`hover:bg-gray-50 ${activeHighlight === item.id ? 'bg-yellow-50 ring-2 ring-yellow-300 ring-inset' : ''}`}
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
                                onClick={() => handleOpenReserva(item)}
                                className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800"
                              >
                                <Archive size={12} /> Reservar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenConsumo(item)}
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
                        onChange={(e) => onUpdateItem(item.id, 'quantidade_planejada', parseFloat(e.target.value))}
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
                      <span className={item.quantidade_planejada - (item.quantidade_reservada || 0) > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>
                        {item.quantidade_reservada || 0}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle w-28 text-right text-sm text-gray-600">
                      {item.quantidade_consumida || 0}
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-3 align-middle text-center w-16">
                        <button type="button" onClick={() => onRemoveItem(item.id)} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </motion.tr>
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
