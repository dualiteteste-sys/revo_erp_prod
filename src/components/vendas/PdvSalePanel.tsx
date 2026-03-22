import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ScanBarcode, Search, Trash2, PackageCheck } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { saveVenda, manageVendaItem, fetchVendaDetails, type VendaDetails } from '@/services/vendas';
import { getUnitPrice } from '@/services/pricing';
import { searchItemsForOs, type OsItemSearchResult } from '@/services/os';
import { ensurePdvDefaultClienteId } from '@/services/vendasMvp';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PdvItem = {
  id: string;
  produtoId: string;
  produtoNome: string;
  produtoSku: string | null;
  produtoUnidade: string | null;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  total: number;
};

export interface PdvSalePanelProps {
  caixaId: string;
  contaCorrenteId: string;
  nfceEnabled: boolean;
  queuedIds: Set<string>;
  onSaleComplete: (pedidoId: string) => void;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function calcItemTotal(qty: number, price: number, discount: number): number {
  return Math.max(0, qty * price - discount);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PdvSalePanel({
  onSaleComplete,
  onClose,
}: PdvSalePanelProps) {
  const { addToast } = useToast();
  const { activeEmpresaId } = useAuth();

  /* State */
  const [items, setItems] = useState<PdvItem[]>([]);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [creatingPedido, setCreatingPedido] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [globalDesconto, setGlobalDesconto] = useState(0);

  /* Search state */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OsItemSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);

  /* SKU state */
  const [skuQuery, setSkuQuery] = useState('');
  const [addingSku, setAddingSku] = useState(false);

  /* Editing state */
  const [editingCell, setEditingCell] = useState<{ idx: number; field: 'quantidade' | 'precoUnitario' | 'desconto' } | null>(null);
  const [editValue, setEditValue] = useState('');

  /* Refs */
  const searchInputRef = useRef<HTMLInputElement>(null);
  const skuInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pedidoIdRef = useRef<string | null>(null);

  /* Derived */
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.total, 0), [items]);
  const totalGeral = useMemo(() => Math.max(0, subtotal - globalDesconto), [subtotal, globalDesconto]);

  /* Keep ref in sync */
  useEffect(() => { pedidoIdRef.current = pedidoId; }, [pedidoId]);

  /* Auto-focus SKU on mount */
  useEffect(() => { skuInputRef.current?.focus(); }, []);

  /* Focus edit input when editing */
  useEffect(() => {
    if (editingCell) {
      setTimeout(() => editInputRef.current?.select(), 0);
    }
  }, [editingCell]);

  /* ---------------------------------------------------------------- */
  /*  Product search (debounced)                                       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchItemsForOs(q, 10, true, 'product');
        setSearchResults(results || []);
        setShowDropdown(true);
        setHighlightIdx(0);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery]);

  /* ---------------------------------------------------------------- */
  /*  Lazy pedido creation                                             */
  /* ---------------------------------------------------------------- */
  const ensurePedido = useCallback(async (): Promise<string> => {
    if (pedidoIdRef.current) return pedidoIdRef.current;
    setCreatingPedido(true);
    try {
      const clienteId = await ensurePdvDefaultClienteId();
      const today = new Date().toISOString().slice(0, 10);
      const venda = await saveVenda({
        cliente_id: clienteId,
        data_emissao: today,
        data_entrega: today,
        status: 'orcamento',
      });
      setPedidoId(venda.id);
      pedidoIdRef.current = venda.id;
      return venda.id;
    } finally {
      setCreatingPedido(false);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Add product                                                      */
  /* ---------------------------------------------------------------- */
  const handleAddProduct = useCallback(async (hit: OsItemSearchResult) => {
    if (!activeEmpresaId || addingProduct) return;
    setAddingProduct(true);
    try {
      const pid = await ensurePedido();
      const pricing = await getUnitPrice({
        produtoId: hit.id,
        quantidade: 1,
        fallbackPrecoUnitario: hit.preco_venda ?? 0,
      });
      const precoUnit = Number(pricing.preco_unitario ?? hit.preco_venda ?? 0);
      await manageVendaItem(pid, null, hit.id, 1, precoUnit, 0, 'add');

      // Reload details to get the real item ID
      const details = await fetchVendaDetails(pid);
      if (details) {
        setItems(details.itens.map((it) => ({
          id: it.id,
          produtoId: it.produto_id,
          produtoNome: it.produto_nome || 'Produto',
          produtoSku: it.produto_sku || null,
          produtoUnidade: it.produto_unidade || null,
          quantidade: Number(it.quantidade),
          precoUnitario: Number(it.preco_unitario),
          desconto: Number(it.desconto),
          total: Number(it.total),
        })));
      }
      addToast(`${hit.descricao} adicionado.`, 'success');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao adicionar produto.', 'error');
    } finally {
      setAddingProduct(false);
      setSearchQuery('');
      setSearchResults([]);
      setShowDropdown(false);
      skuInputRef.current?.focus();
    }
  }, [activeEmpresaId, addingProduct, addToast, ensurePedido]);

  /* ---------------------------------------------------------------- */
  /*  Add by SKU / barcode                                             */
  /* ---------------------------------------------------------------- */
  const handleAddSku = useCallback(async () => {
    const sku = skuQuery.trim();
    if (!sku || addingSku) return;
    setAddingSku(true);
    try {
      const results = await searchItemsForOs(sku, 5, true, 'product');
      const hit = results?.find((r) => r.sku === sku || r.codigo === sku) || results?.[0];
      if (!hit) {
        addToast('SKU não encontrado.', 'warning');
        return;
      }
      await handleAddProduct(hit);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao adicionar SKU.', 'error');
    } finally {
      setAddingSku(false);
      setSkuQuery('');
      skuInputRef.current?.focus();
    }
  }, [skuQuery, addingSku, addToast, handleAddProduct]);

  /* ---------------------------------------------------------------- */
  /*  Update item (qty, price, discount)                               */
  /* ---------------------------------------------------------------- */
  const commitEdit = useCallback(async () => {
    if (!editingCell || !pedidoId) return;
    const { idx, field } = editingCell;
    const item = items[idx];
    if (!item) { setEditingCell(null); return; }

    const newVal = Math.max(0, parseFloat(editValue.replace(',', '.')) || 0);
    if (field === 'quantidade' && newVal === 0) {
      addToast('Quantidade deve ser maior que zero.', 'warning');
      setEditingCell(null);
      return;
    }

    const updated = { ...item };
    if (field === 'quantidade') {
      updated.quantidade = newVal;
      // Re-price with fallback to current price (fixes the price-disappearing bug)
      try {
        const pricing = await getUnitPrice({
          produtoId: item.produtoId,
          quantidade: newVal,
          fallbackPrecoUnitario: item.precoUnitario,
        });
        updated.precoUnitario = Number(pricing.preco_unitario);
      } catch { /* keep current price */ }
    } else if (field === 'precoUnitario') {
      updated.precoUnitario = newVal;
    } else if (field === 'desconto') {
      updated.desconto = newVal;
    }
    updated.total = calcItemTotal(updated.quantidade, updated.precoUnitario, updated.desconto);

    setEditingCell(null);
    setIsSaving(true);
    try {
      await manageVendaItem(pedidoId, item.id, item.produtoId, updated.quantidade, updated.precoUnitario, updated.desconto, 'update');
      setItems((prev) => prev.map((it, i) => (i === idx ? updated : it)));
    } catch (e: any) {
      addToast(e?.message || 'Falha ao atualizar item.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [editingCell, editValue, items, pedidoId, addToast]);

  /* ---------------------------------------------------------------- */
  /*  Remove item                                                      */
  /* ---------------------------------------------------------------- */
  const handleRemoveItem = useCallback(async (idx: number) => {
    const item = items[idx];
    if (!item || !pedidoId) return;
    setIsSaving(true);
    try {
      await manageVendaItem(pedidoId, item.id, item.produtoId, 0, 0, 0, 'remove');
      setItems((prev) => prev.filter((_, i) => i !== idx));
      addToast('Item removido.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao remover item.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [items, pedidoId, addToast]);

  /* ---------------------------------------------------------------- */
  /*  Finalize (F9)                                                    */
  /* ---------------------------------------------------------------- */
  const handleFinalize = useCallback(() => {
    if (!pedidoId || items.length === 0) return;
    onSaleComplete(pedidoId);
  }, [pedidoId, items.length, onSaleComplete]);

  /* ---------------------------------------------------------------- */
  /*  Keyboard shortcuts                                               */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        skuInputRef.current?.focus();
      }
      if (e.key === 'F9' && pedidoId && items.length > 0 && !editingCell) {
        e.preventDefault();
        handleFinalize();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pedidoId, items.length, editingCell, handleFinalize]);

  /* ---------------------------------------------------------------- */
  /*  Search keyboard nav                                              */
  /* ---------------------------------------------------------------- */
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = searchResults[highlightIdx];
      if (hit) void handleAddProduct(hit);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Edit cell keyboard                                               */
  /* ---------------------------------------------------------------- */
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      void commitEdit();
      // Move to next editable field
      if (editingCell) {
        const fields: Array<'quantidade' | 'precoUnitario' | 'desconto'> = ['quantidade', 'precoUnitario', 'desconto'];
        const curFieldIdx = fields.indexOf(editingCell.field);
        if (curFieldIdx < fields.length - 1) {
          const nextField = fields[curFieldIdx + 1];
          const item = items[editingCell.idx];
          if (item) {
            setTimeout(() => {
              setEditingCell({ idx: editingCell.idx, field: nextField });
              setEditValue(String(item[nextField]).replace('.', ','));
            }, 50);
          }
        }
      }
    }
  };

  const startEdit = (idx: number, field: 'quantidade' | 'precoUnitario' | 'desconto') => {
    const item = items[idx];
    if (!item) return;
    setEditingCell({ idx, field });
    setEditValue(String(item[field]).replace('.', ','));
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  const busy = creatingPedido || addingProduct || addingSku || isSaving;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Search bar ── */}
      <div className="flex-shrink-0 p-4 pb-2 space-y-2 border-b border-gray-200">
        {/* SKU / barcode input */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-gray-600 font-semibold text-sm whitespace-nowrap">
            <ScanBarcode size={16} />
            <span>SKU</span>
          </div>
          <input
            ref={skuInputRef}
            value={skuQuery}
            onChange={(e) => setSkuQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddSku(); } }}
            placeholder="Código de barras ou SKU (Enter p/ adicionar) — F2 foca aqui"
            disabled={addingSku}
            className="flex-grow p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            tabIndex={1}
          />
          {addingSku ? <Loader2 className="animate-spin text-blue-600 w-5 h-5" /> : null}
        </div>

        {/* Name search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="Buscar produto por nome…"
            className="w-full p-2.5 pl-9 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            tabIndex={2}
          />
          {searching ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-600 w-4 h-4" /> : null}

          {/* Search dropdown */}
          {showDropdown && searchResults.length > 0 ? (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {searchResults.map((hit, i) => (
                <button
                  key={hit.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); void handleAddProduct(hit); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between items-center ${
                    i === highlightIdx ? 'bg-blue-50' : ''
                  }`}
                >
                  <div>
                    <div className="font-medium text-gray-900">{hit.descricao}</div>
                    {hit.sku ? <div className="text-xs text-gray-500">SKU: {hit.sku}</div> : null}
                  </div>
                  <div className="text-sm font-semibold text-gray-700 whitespace-nowrap ml-4">
                    {hit.preco_venda != null ? formatBRL(hit.preco_venda) : '—'}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Items table ── */}
      <div className="flex-grow overflow-auto min-h-0">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {busy ? <Loader2 className="animate-spin w-6 h-6 text-blue-500" /> : 'Escaneie ou busque um produto para começar'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="text-left text-gray-600">
                <th className="px-4 py-2.5 w-10">#</th>
                <th className="px-4 py-2.5">Produto</th>
                <th className="px-4 py-2.5 w-24 text-right">Qtd</th>
                <th className="px-4 py-2.5 w-28 text-right">Unit.</th>
                <th className="px-4 py-2.5 w-24 text-right">Desc.</th>
                <th className="px-4 py-2.5 w-28 text-right">Total</th>
                <th className="px-4 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{item.produtoNome}</div>
                    {item.produtoSku ? <div className="text-xs text-gray-500">{item.produtoSku}</div> : null}
                  </td>
                  {/* Quantidade */}
                  <td className="px-4 py-2 text-right">
                    {editingCell?.idx === idx && editingCell.field === 'quantidade' ? (
                      <input
                        ref={editInputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={() => void commitEdit()}
                        className="w-20 p-1 border border-blue-400 rounded text-right text-sm focus:ring-1 focus:ring-blue-500"
                        inputMode="decimal"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(idx, 'quantidade')}
                        className="w-full text-right hover:bg-blue-50 rounded px-1 py-0.5 cursor-text"
                        tabIndex={10 + idx * 3}
                      >
                        {item.quantidade}
                      </button>
                    )}
                  </td>
                  {/* Preço unitário */}
                  <td className="px-4 py-2 text-right">
                    {editingCell?.idx === idx && editingCell.field === 'precoUnitario' ? (
                      <input
                        ref={editInputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={() => void commitEdit()}
                        className="w-24 p-1 border border-blue-400 rounded text-right text-sm focus:ring-1 focus:ring-blue-500"
                        inputMode="decimal"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(idx, 'precoUnitario')}
                        className="w-full text-right hover:bg-blue-50 rounded px-1 py-0.5 cursor-text"
                        tabIndex={11 + idx * 3}
                      >
                        {formatBRL(item.precoUnitario)}
                      </button>
                    )}
                  </td>
                  {/* Desconto */}
                  <td className="px-4 py-2 text-right">
                    {editingCell?.idx === idx && editingCell.field === 'desconto' ? (
                      <input
                        ref={editInputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={() => void commitEdit()}
                        className="w-20 p-1 border border-blue-400 rounded text-right text-sm focus:ring-1 focus:ring-blue-500"
                        inputMode="decimal"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(idx, 'desconto')}
                        className="w-full text-right hover:bg-blue-50 rounded px-1 py-0.5 cursor-text text-gray-500"
                        tabIndex={12 + idx * 3}
                      >
                        {item.desconto > 0 ? formatBRL(item.desconto) : '—'}
                      </button>
                    )}
                  </td>
                  {/* Total */}
                  <td className="px-4 py-2 text-right font-semibold">{formatBRL(item.total)}</td>
                  {/* Remove */}
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => void handleRemoveItem(idx)}
                      className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                      title="Remover item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Totals footer ── */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal ({items.length} {items.length === 1 ? 'item' : 'itens'})</span>
          <span>{formatBRL(subtotal)}</span>
        </div>
        {globalDesconto > 0 ? (
          <div className="flex justify-between text-sm text-red-600">
            <span>Desconto</span>
            <span>-{formatBRL(globalDesconto)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-xl font-bold text-gray-900 mt-1 pt-2 border-t border-gray-300">
          <span>TOTAL</span>
          <span>{formatBRL(totalGeral)}</span>
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="flex-shrink-0 border-t border-gray-200 px-4 py-3 flex justify-between items-center bg-white">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium"
          >
            Cancelar
          </button>
          <span className="hidden sm:flex items-center gap-3 text-[11px] text-gray-400">
            <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-500 font-mono">F2</kbd> Busca
            <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-500 font-mono">F9</kbd> Finalizar
          </span>
        </div>
        <button
          type="button"
          onClick={handleFinalize}
          disabled={items.length === 0 || busy}
          className="flex items-center gap-2 bg-emerald-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm transition-colors"
          title="Atalho: F9"
          tabIndex={100}
        >
          <PackageCheck size={20} />
          Finalizar (F9)
        </button>
      </div>
    </div>
  );
}
