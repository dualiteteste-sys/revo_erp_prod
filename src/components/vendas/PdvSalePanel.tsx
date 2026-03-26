import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, Trash2, PackageCheck, UserRound } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { saveVenda, manageVendaItem, fetchVendaDetails } from '@/services/vendas';
import { getUnitPrice } from '@/services/pricing';
import { type OsItemSearchResult } from '@/services/os';
import { ensurePdvDefaultClienteId } from '@/services/vendasMvp';
import { listVendedores, type Vendedor } from '@/services/vendedores';
import { usePdvOmnibox } from '@/hooks/usePdvOmnibox';
import PdvCustomerBar from './PdvCustomerBar';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type DescontoTipo = 'R$' | '%';

type PdvItem = {
  id: string;
  produtoId: string;
  produtoNome: string;
  produtoSku: string | null;
  produtoUnidade: string | null;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  descontoTipo: DescontoTipo;
  descontoInput: number;
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

function calcDiscount(tipo: DescontoTipo, input: number, qty: number, price: number): number {
  if (tipo === '%') {
    const pct = Math.min(100, Math.max(0, input));
    return qty * price * (pct / 100);
  }
  return Math.max(0, input);
}

/* ------------------------------------------------------------------ */
/*  Inline discount toggle                                             */
/* ------------------------------------------------------------------ */

function DescontoTipoToggle({ value, onChange }: { value: DescontoTipo; onChange: (v: DescontoTipo) => void }) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs mr-1">
      <button
        type="button"
        onClick={() => onChange('R$')}
        className={`px-1.5 py-0.5 transition-colors ${value === 'R$' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
      >
        R$
      </button>
      <button
        type="button"
        onClick={() => onChange('%')}
        className={`px-1.5 py-0.5 transition-colors ${value === '%' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
      >
        %
      </button>
    </div>
  );
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

  /* Global discount */
  const [globalDescontoTipo, setGlobalDescontoTipo] = useState<DescontoTipo>('R$');
  const [globalDescontoInput, setGlobalDescontoInput] = useState(0);

  /* Vendedor */
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState<string | null>(null);

  /* Customer / CPF */
  const [cpfConsumidor, setCpfConsumidor] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState<string | null>(null);

  /* Editing state */
  const [editingCell, setEditingCell] = useState<{ idx: number; field: 'quantidade' | 'precoUnitario' | 'desconto' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescontoTipo, setEditDescontoTipo] = useState<DescontoTipo>('R$');

  /* Refs */
  const editInputRef = useRef<HTMLInputElement>(null);
  const pedidoIdRef = useRef<string | null>(null);
  const vendedorIdRef = useRef<string | null>(null);
  const clienteIdRef = useRef<string | null>(null);
  const cpfConsumidorRef = useRef('');

  /* Derived */
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.total, 0), [items]);
  const globalDesconto = useMemo(() => {
    if (globalDescontoTipo === '%') {
      const pct = Math.min(100, Math.max(0, globalDescontoInput));
      return subtotal * (pct / 100);
    }
    return Math.max(0, globalDescontoInput);
  }, [globalDescontoTipo, globalDescontoInput, subtotal]);
  const totalGeral = useMemo(() => Math.max(0, subtotal - globalDesconto), [subtotal, globalDesconto]);

  /* Keep refs in sync */
  useEffect(() => { pedidoIdRef.current = pedidoId; }, [pedidoId]);
  useEffect(() => { vendedorIdRef.current = vendedorId; }, [vendedorId]);
  useEffect(() => { clienteIdRef.current = clienteId; }, [clienteId]);
  useEffect(() => { cpfConsumidorRef.current = cpfConsumidor; }, [cpfConsumidor]);

  /* Load vendedores on mount */
  useEffect(() => {
    if (!activeEmpresaId) return;
    listVendedores(undefined, true).then(setVendedores).catch(() => {});
  }, [activeEmpresaId]);

  /* Focus edit input when editing */
  useEffect(() => {
    if (editingCell) {
      setTimeout(() => editInputRef.current?.select(), 0);
    }
  }, [editingCell]);

  /* ---------------------------------------------------------------- */
  /*  Persist global discount to pedido header                         */
  /* ---------------------------------------------------------------- */
  const saveGlobalDesconto = useCallback(async (descontoValue: number) => {
    if (!pedidoIdRef.current) return;
    try {
      await saveVenda({ id: pedidoIdRef.current, desconto: descontoValue });
    } catch { /* non-critical — will be saved at finalize */ }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Lazy pedido creation                                             */
  /* ---------------------------------------------------------------- */
  const ensurePedido = useCallback(async (): Promise<string> => {
    if (pedidoIdRef.current) return pedidoIdRef.current;
    setCreatingPedido(true);
    try {
      const cId = clienteIdRef.current || await ensurePdvDefaultClienteId();
      const today = new Date().toISOString().slice(0, 10);
      const payload: Record<string, unknown> = {
        cliente_id: cId,
        data_emissao: today,
        data_entrega: today,
        status: 'orcamento',
      };
      if (vendedorIdRef.current) {
        payload.vendedor_id = vendedorIdRef.current;
      }
      const rawCpf = cpfConsumidorRef.current.replace(/\D/g, '');
      if (rawCpf.length === 11) {
        payload.cpf_consumidor = rawCpf;
      }
      const venda = await saveVenda(payload as any);
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
          descontoTipo: 'R$' as DescontoTipo,
          descontoInput: Number(it.desconto),
          total: Number(it.total),
        })));
      }
      addToast(`${hit.descricao} adicionado.`, 'success');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao adicionar produto.', 'error');
    } finally {
      setAddingProduct(false);
    }
  }, [activeEmpresaId, addingProduct, addToast, ensurePedido]);

  /* ---------------------------------------------------------------- */
  /*  Omnibox hook                                                     */
  /* ---------------------------------------------------------------- */
  const omnibox = usePdvOmnibox({
    onProductFound: (hit) => {
      void handleAddProduct(hit);
    },
    onNotFound: (q) => addToast(`"${q}" não encontrado.`, 'warning'),
    disabled: addingProduct,
  });

  /* Auto-focus omnibox on mount */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { omnibox.inputRef.current?.focus(); }, []);

  /* ---------------------------------------------------------------- */
  /*  Customer / CPF handlers                                          */
  /* ---------------------------------------------------------------- */
  const handleCpfChange = useCallback((cpf: string) => {
    setCpfConsumidor(cpf);
    const rawCpf = cpf.replace(/\D/g, '');
    if (pedidoIdRef.current && rawCpf.length === 11) {
      saveVenda({ id: pedidoIdRef.current, cpf_consumidor: rawCpf } as any).catch(() => {});
    }
  }, []);

  const handleClienteChange = useCallback(async (id: string | null, nome?: string) => {
    setClienteId(id);
    setClienteNome(nome || null);
    clienteIdRef.current = id;

    if (id && pedidoIdRef.current) {
      try {
        await saveVenda({ id: pedidoIdRef.current, cliente_id: id } as any);
      } catch { /* non-critical */ }
    }
  }, []);

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
      try {
        const pricing = await getUnitPrice({
          produtoId: item.produtoId,
          quantidade: newVal,
          fallbackPrecoUnitario: item.precoUnitario,
        });
        updated.precoUnitario = Number(pricing.preco_unitario);
      } catch { /* keep current price */ }
      if (updated.descontoTipo === '%') {
        updated.desconto = calcDiscount('%', updated.descontoInput, updated.quantidade, updated.precoUnitario);
      }
    } else if (field === 'precoUnitario') {
      updated.precoUnitario = newVal;
      if (updated.descontoTipo === '%') {
        updated.desconto = calcDiscount('%', updated.descontoInput, updated.quantidade, updated.precoUnitario);
      }
    } else if (field === 'desconto') {
      updated.descontoTipo = editDescontoTipo;
      updated.descontoInput = newVal;
      updated.desconto = calcDiscount(editDescontoTipo, newVal, updated.quantidade, updated.precoUnitario);
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
  }, [editingCell, editValue, editDescontoTipo, items, pedidoId, addToast]);

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
  /*  Vendedor change                                                  */
  /* ---------------------------------------------------------------- */
  const handleVendedorChange = useCallback(async (newId: string | null) => {
    setVendedorId(newId);
    vendedorIdRef.current = newId;
    if (pedidoIdRef.current) {
      try {
        await saveVenda({ id: pedidoIdRef.current, vendedor_id: newId } as any);
      } catch { /* non-critical */ }
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Finalize (F9)                                                    */
  /* ---------------------------------------------------------------- */
  const handleFinalize = useCallback(async () => {
    if (!pedidoId || items.length === 0) return;
    if (globalDesconto > 0) {
      await saveGlobalDesconto(globalDesconto);
    }
    const rawCpf = cpfConsumidorRef.current.replace(/\D/g, '');
    if (rawCpf.length === 11) {
      try {
        await saveVenda({ id: pedidoId, cpf_consumidor: rawCpf } as any);
      } catch { /* will still finalize */ }
    }
    onSaleComplete(pedidoId);
  }, [pedidoId, items.length, globalDesconto, saveGlobalDesconto, onSaleComplete]);

  /* ---------------------------------------------------------------- */
  /*  Keyboard shortcuts                                               */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        omnibox.inputRef.current?.focus();
      }
      if (e.key === 'F9' && pedidoId && items.length > 0 && !editingCell) {
        e.preventDefault();
        void handleFinalize();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pedidoId, items.length, editingCell, handleFinalize, omnibox.inputRef]);

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
      if (editingCell) {
        const fields: Array<'quantidade' | 'precoUnitario' | 'desconto'> = ['quantidade', 'precoUnitario', 'desconto'];
        const curFieldIdx = fields.indexOf(editingCell.field);
        if (curFieldIdx < fields.length - 1) {
          const nextField = fields[curFieldIdx + 1];
          const item = items[editingCell.idx];
          if (item) {
            setTimeout(() => {
              setEditingCell({ idx: editingCell.idx, field: nextField });
              if (nextField === 'desconto') {
                setEditDescontoTipo(item.descontoTipo);
                setEditValue(String(item.descontoInput).replace('.', ','));
              } else {
                setEditValue(String(item[nextField]).replace('.', ','));
              }
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
    if (field === 'desconto') {
      setEditDescontoTipo(item.descontoTipo);
      setEditValue(String(item.descontoInput).replace('.', ','));
    } else {
      setEditValue(String(item[field]).replace('.', ','));
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  const busy = creatingPedido || addingProduct || omnibox.isSearching || isSaving;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Omnibox search bar ── */}
      <div className="flex-shrink-0 p-4 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              ref={omnibox.inputRef}
              value={omnibox.query}
              onChange={omnibox.handleChange}
              onKeyDown={omnibox.handleKeyDown}
              onFocus={() => { if (omnibox.results.length > 0) omnibox.setShowDropdown(true); }}
              onBlur={() => setTimeout(() => omnibox.setShowDropdown(false), 200)}
              placeholder="Código de barras, SKU ou nome do produto — F2 foca aqui"
              disabled={omnibox.disabled}
              className="w-full p-2.5 pl-9 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              tabIndex={1}
            />
            {omnibox.isSearching ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-600 w-4 h-4" /> : null}

            {/* Search dropdown */}
            {omnibox.showDropdown && omnibox.results.length > 0 ? (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                {omnibox.results.map((hit, i) => (
                  <button
                    key={hit.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); void handleAddProduct(hit); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between items-center ${
                      i === omnibox.highlightIdx ? 'bg-blue-50' : ''
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

          {/* Vendedor select */}
          {vendedores.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <UserRound size={16} className="text-gray-500" />
              <select
                value={vendedorId || ''}
                onChange={(e) => void handleVendedorChange(e.target.value || null)}
                className="p-2.5 border border-gray-300 rounded-lg text-sm min-w-[160px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                tabIndex={2}
              >
                <option value="">Vendedor…</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Customer / CPF bar ── */}
      <PdvCustomerBar
        cpf={cpfConsumidor}
        onCpfChange={handleCpfChange}
        clienteId={clienteId}
        clienteNome={clienteNome}
        onClienteChange={handleClienteChange}
        disabled={busy}
      />

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
                <th className="px-4 py-2.5 w-32 text-right">Desc.</th>
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
                  {/* Desconto (R$ / %) */}
                  <td className="px-4 py-2 text-right">
                    {editingCell?.idx === idx && editingCell.field === 'desconto' ? (
                      <div className="flex items-center justify-end gap-0.5">
                        <DescontoTipoToggle value={editDescontoTipo} onChange={setEditDescontoTipo} />
                        <input
                          ref={editInputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          onBlur={() => void commitEdit()}
                          className="w-16 p-1 border border-blue-400 rounded text-right text-sm focus:ring-1 focus:ring-blue-500"
                          inputMode="decimal"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(idx, 'desconto')}
                        className="w-full text-right hover:bg-blue-50 rounded px-1 py-0.5 cursor-text text-gray-500"
                        tabIndex={12 + idx * 3}
                      >
                        {item.desconto > 0
                          ? item.descontoTipo === '%'
                            ? `${item.descontoInput}%`
                            : formatBRL(item.desconto)
                          : '—'}
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

        {/* Global discount input */}
        {items.length > 0 && (
          <div className="flex items-center justify-between mt-1.5 py-1.5">
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <span>Desconto</span>
              <DescontoTipoToggle value={globalDescontoTipo} onChange={setGlobalDescontoTipo} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={globalDescontoInput > 0 ? String(globalDescontoInput).replace('.', ',') : ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value.replace(',', '.')) || 0;
                  setGlobalDescontoInput(v);
                }}
                onBlur={() => { if (globalDesconto > 0) void saveGlobalDesconto(globalDesconto); }}
                placeholder="0,00"
                className="w-24 p-1.5 border border-gray-300 rounded-lg text-right text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              {globalDesconto > 0 && (
                <span className="text-sm text-red-600 font-medium whitespace-nowrap">
                  -{formatBRL(globalDesconto)}
                </span>
              )}
            </div>
          </div>
        )}

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
            <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-500 font-mono">F4</kbd> Cliente
            <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-500 font-mono">F9</kbd> Finalizar
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleFinalize()}
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
