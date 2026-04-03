import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  onUpdateItem?: (itemId: string, payload: { quantidade?: number; preco?: number; desconto_pct?: number }) => void;
  isAddingItem: boolean;
  readOnly?: boolean;
}

const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const InlineNumberInput: React.FC<{
  value: number;
  onCommit: (val: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: string;
  align?: 'left' | 'center' | 'right';
  prefix?: string;
  suffix?: string;
}> = ({ value, onCommit, disabled, min, max, step = 'any', align = 'right', prefix, suffix }) => {
  const [localVal, setLocalVal] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const prevValueRef = useRef(value);

  // Sync from server when item prop changes
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    if (!focused) setLocalVal(String(value));
  }

  const handleBlur = useCallback(() => {
    setFocused(false);
    const parsed = parseFloat(localVal);
    if (isNaN(parsed)) {
      setLocalVal(String(value));
      return;
    }
    const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed));
    setLocalVal(String(clamped));
    if (clamped !== value) onCommit(clamped);
  }, [localVal, value, min, max, onCommit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') { setLocalVal(String(value)); (e.target as HTMLInputElement).blur(); }
  }, [value]);

  const textAlign = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  return (
    <div className={`flex items-center gap-0.5 ${textAlign}`}>
      {prefix && <span className="text-gray-400 text-xs">{prefix}</span>}
      <input
        type="number"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className={`w-full bg-transparent border rounded px-1.5 py-0.5 text-sm transition-colors
          ${focused ? 'border-blue-400 bg-white ring-1 ring-blue-100' : 'border-transparent hover:border-gray-300'}
          ${disabled ? 'opacity-60 cursor-not-allowed hover:border-transparent' : ''}
          ${textAlign} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
      {suffix && <span className="text-gray-400 text-xs">{suffix}</span>}
    </div>
  );
};

const ItemRow: React.FC<{
  item: OrdemServicoItem;
  onRemove: (itemId: string) => void;
  onUpdate?: (itemId: string, payload: { quantidade?: number; preco?: number; desconto_pct?: number }) => void;
  readOnly?: boolean;
}> = ({ item, onRemove, onUpdate, readOnly = false }) => {

  const [localQtd, setLocalQtd] = useState(item.quantidade);
  const [localPreco, setLocalPreco] = useState(item.preco);
  const [localDesconto, setLocalDesconto] = useState(item.desconto_pct);

  // Sync from server
  if (item.quantidade !== localQtd && !document.activeElement?.closest(`[data-item-id="${item.id}"]`)) {
    setLocalQtd(item.quantidade);
  }
  if (item.preco !== localPreco && !document.activeElement?.closest(`[data-item-id="${item.id}"]`)) {
    setLocalPreco(item.preco);
  }
  if (item.desconto_pct !== localDesconto && !document.activeElement?.closest(`[data-item-id="${item.id}"]`)) {
    setLocalDesconto(item.desconto_pct);
  }

  const total = (localQtd || 0) * (localPreco || 0) * (1 - (localDesconto || 0) / 100);
  const isService = !!item.servico_id;

  return (
    <motion.tr
        layout
        data-item-id={item.id}
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
      <td className="px-2 py-1 align-middle">
        <InlineNumberInput
          value={item.quantidade}
          onCommit={(v) => { setLocalQtd(v); onUpdate?.(item.id, { quantidade: v }); }}
          disabled={readOnly || !onUpdate}
          min={0.001}
          align="center"
        />
      </td>
      <td className="px-2 py-1 align-middle">
        <InlineNumberInput
          value={item.preco}
          onCommit={(v) => { setLocalPreco(v); onUpdate?.(item.id, { preco: v }); }}
          disabled={readOnly || !onUpdate}
          min={0}
          step="0.01"
          align="right"
        />
      </td>
      <td className="px-2 py-1 align-middle">
        <InlineNumberInput
          value={item.desconto_pct}
          onCommit={(v) => { setLocalDesconto(v); onUpdate?.(item.id, { desconto_pct: v }); }}
          disabled={readOnly || !onUpdate}
          min={0}
          max={100}
          step="0.01"
          align="right"
          suffix="%"
        />
      </td>
      <td className="px-2 py-2 align-middle text-right font-semibold">
        {currencyFmt.format(total)}
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

const OsFormItems: React.FC<OsFormItemsProps> = ({ items, onRemoveItem, onAddItem, onUpdateItem, isAddingItem, readOnly = false }) => {
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
                                <ItemRow key={item.id} item={item} onRemove={onRemoveItem} onUpdate={onUpdateItem} readOnly={readOnly} />
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
