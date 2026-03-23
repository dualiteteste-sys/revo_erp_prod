import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Wand2,
  X,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import {
  ensureAtributo,
  generateVariantes,
  listAtributos,
  listVariantes,
  updateVariantField,
  type AtributoRow,
  type VariantRow,
} from '@/services/productVariants';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';
import Modal from '@/components/ui/Modal';
import ProdutoCodigoBarrasSection from '@/components/products/barcodes/ProdutoCodigoBarrasSection';
import { listProdutoCodigosBarras, type ProdutoCodigoBarrasListRow } from '@/services/produtosCodigosBarras';

type Props = {
  produtoId: string | null | undefined;
  produtoPaiId: string | null | undefined;
  skuBase?: string | null | undefined;
};

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatStock = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);

function splitValores(raw: string): string[] {
  return raw.split(/[,\n;]/g).map((v) => v.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Inline editable cell
// ---------------------------------------------------------------------------
function InlineEditCell({
  value,
  field,
  variantId,
  type = 'text',
  onSaved,
}: {
  value: string;
  field: string;
  variantId: string;
  type?: 'text' | 'money';
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, value]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      let patchValue: unknown = trimmed;
      if (type === 'money') {
        const num = parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
        if (isNaN(num) || num < 0) {
          setDraft(value);
          setEditing(false);
          setSaving(false);
          return;
        }
        patchValue = Math.round(num * 100) / 100;
      }
      await updateVariantField(variantId, { [field]: patchValue });
      onSaved();
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, value, field, variantId, type, onSaved]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          className="w-full px-2 py-1 text-sm rounded-lg border border-blue-300 bg-white/90 focus:ring-2 focus:ring-blue-400/40 outline-none font-mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={() => void save()}
          disabled={saving}
        />
        {saving ? (
          <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
        ) : (
          <button
            type="button"
            onClick={() => void save()}
            className="p-0.5 rounded hover:bg-blue-50 text-blue-600 shrink-0"
          >
            <Check size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="group inline-flex items-center gap-1.5 text-sm font-mono text-gray-700 hover:text-blue-600 transition-colors cursor-text"
      onClick={() => setEditing(true)}
      title="Clique para editar"
    >
      <span className="truncate max-w-[140px]">{value || '—'}</span>
      <Pencil size={12} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function VariacoesTab({ produtoId, produtoPaiId, skuBase }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [atributos, setAtributos] = useState<AtributoRow[]>([]);
  const [variantes, setVariantes] = useState<VariantRow[]>([]);
  const [barcodes, setBarcodes] = useState<ProdutoCodigoBarrasListRow[]>([]);
  const [atributoId, setAtributoId] = useState<string>('');
  const [novoAtributoNome, setNovoAtributoNome] = useState('Cor');
  const [valoresRaw, setValoresRaw] = useState('');
  const [valoresTags, setValoresTags] = useState<string[]>([]);
  const [skuSuffixMode, setSkuSuffixMode] = useState<'slug' | 'num'>('slug');
  const [barcodeVariant, setBarcodeVariant] = useState<VariantRow | null>(null);

  const canUse = !!produtoId && !produtoPaiId;
  const valores = useMemo(() => {
    const fromRaw = splitValores(valoresRaw);
    const merged = [...valoresTags, ...fromRaw];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of merged) {
      const clean = v.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  }, [valoresRaw, valoresTags]);

  const reload = useCallback(async () => {
    if (!produtoId) return;
    setLoading(true);
    try {
      const [attrs, vars] = await Promise.all([
        listAtributos(),
        produtoPaiId ? Promise.resolve([] as VariantRow[]) : listVariantes(produtoId),
      ]);
      setAtributos(attrs ?? []);
      setVariantes(vars ?? []);
      if (!produtoPaiId) {
        const rows = await listProdutoCodigosBarras({ produtoPaiId: produtoId });
        setBarcodes(rows ?? []);
      } else {
        setBarcodes([]);
      }
      if (!atributoId) {
        const cor = (attrs ?? []).find((a) => a.nome.toLowerCase() === 'cor');
        if (cor) setAtributoId(cor.id);
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar variações.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId, produtoPaiId, addToast]);

  const barcodeByVariantId = useMemo(() => {
    const m = new Map<string, ProdutoCodigoBarrasListRow>();
    for (const row of barcodes) m.set(row.variante_id, row);
    return m;
  }, [barcodes]);

  useEffect(() => { void reload(); }, [reload]);

  // ---- Gerar variações ----
  const handleGerar = async () => {
    if (!produtoId) { addToast('Salve o produto antes de criar variações.', 'warning'); return; }
    if (produtoPaiId) { addToast('Este produto já é uma variação.', 'warning'); return; }
    if (valores.length === 0) { addToast('Informe ao menos 1 valor.', 'warning'); return; }
    setLoading(true);
    try {
      let finalAtributoId = atributoId;
      if (!finalAtributoId) {
        finalAtributoId = await ensureAtributo({ nome: novoAtributoNome, tipo: 'text' });
        setAtributoId(finalAtributoId);
      }
      const created = await generateVariantes({ produtoPaiId: produtoId, atributoId: finalAtributoId, valores, skuSuffixMode });
      addToast(`${created?.length ?? 0} variações criadas.`, 'success');
      setValoresRaw('');
      setValoresTags([]);
      await reload();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar variações.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ---- Tag helpers ----
  const commitRawToTags = () => {
    const tokens = splitValores(valoresRaw).map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (tokens.length === 0) return;
    setValoresTags((prev) => {
      const next = [...prev];
      const existing = new Set(prev.map((x) => x.toLowerCase()));
      for (const t of tokens) { const key = t.toLowerCase(); if (!existing.has(key)) { existing.add(key); next.push(t); } }
      return next;
    });
    setValoresRaw('');
  };
  const removeTagAt = (i: number) => setValoresTags((prev) => prev.filter((_, idx) => idx !== i));

  // ---- Empty states ----
  if (!produtoId) {
    return (
      <div className="p-8 rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-sm text-center">
        <Package size={32} className="mx-auto text-slate-300 mb-3" />
        <div className="text-gray-700 font-semibold">Variações</div>
        <div className="text-sm text-gray-500 mt-1">Salve o produto primeiro para criar variações.</div>
      </div>
    );
  }

  if (produtoPaiId) {
    return (
      <div className="p-8 rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-sm text-center">
        <Package size={32} className="mx-auto text-slate-300 mb-3" />
        <div className="text-gray-700 font-semibold">Variações</div>
        <div className="text-sm text-gray-500 mt-1">Este produto é uma variação. Gerencie no produto pai.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <div className="text-gray-900 font-semibold text-lg">Variações</div>
          <div className="text-sm text-gray-500 mt-0.5">
            {variantes.length > 0
              ? `${variantes.length} variação${variantes.length > 1 ? 'ões' : ''}`
              : 'Nenhuma variação criada'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="px-3 py-2 rounded-xl border border-slate-200/60 bg-white/70 backdrop-blur-sm hover:bg-white text-sm font-medium flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors shadow-sm"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Generator card */}
      <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-sm shadow-sm p-5">
        <div className="flex items-center gap-2 text-gray-900 font-semibold mb-4">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
            <Wand2 size={16} />
          </div>
          Gerar variações
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Atributo</label>
            <select
              className="w-full px-3 py-2.5 border border-slate-200/60 rounded-xl bg-white/80 text-sm focus:ring-2 focus:ring-blue-400/30 focus:border-blue-300 outline-none transition"
              value={atributoId}
              onChange={(e) => setAtributoId(e.target.value)}
              disabled={loading}
            >
              <option value="">Criar/usar &quot;{novoAtributoNome}&quot;</option>
              {atributos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            {!atributoId && (
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Nome do atributo</label>
                <input
                  className="w-full px-3 py-2 border border-slate-200/60 rounded-xl bg-white/80 text-sm focus:ring-2 focus:ring-blue-400/30 outline-none"
                  value={novoAtributoNome}
                  onChange={(e) => setNovoAtributoNome(e.target.value)}
                  disabled={loading}
                  placeholder="Ex.: Cor"
                />
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Sufixo SKU</label>
            <select
              className="w-full px-3 py-2.5 border border-slate-200/60 rounded-xl bg-white/80 text-sm focus:ring-2 focus:ring-blue-400/30 outline-none transition"
              value={skuSuffixMode}
              onChange={(e) => setSkuSuffixMode(e.target.value as 'slug' | 'num')}
              disabled={loading}
            >
              <option value="slug">Slug (branca)</option>
              <option value="num">Numérico (01, 02...)</option>
            </select>
            <div className="text-[11px] text-gray-400 mt-1.5">Base: {skuBase || '—'}</div>
          </div>

          <div className="sm:col-span-6">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Valores (separados por vírgula)</label>
            <div className="w-full px-3 py-2 border border-slate-200/60 rounded-xl bg-white/80 min-h-[52px] focus-within:ring-2 focus-within:ring-blue-400/30 focus-within:border-blue-300 transition">
              <div className="flex flex-wrap gap-1.5">
                {valoresTags.map((tag, idx) => (
                  <button
                    key={`${tag}:${idx}`}
                    type="button"
                    onClick={() => removeTagAt(idx)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 text-blue-700 text-xs font-medium border border-blue-200/50 hover:bg-blue-100/80 transition-colors"
                    disabled={loading}
                    title="Remover"
                  >
                    <span className="max-w-[200px] truncate">{tag}</span>
                    <X size={12} className="text-blue-400" />
                  </button>
                ))}
                <input
                  className="flex-1 min-w-[160px] px-1 py-1 text-sm outline-none bg-transparent"
                  value={valoresRaw}
                  onChange={(e) => setValoresRaw(e.target.value)}
                  onBlur={() => commitRawToTags()}
                  onKeyDown={(e) => {
                    if (e.key === ',' || e.key === 'Tab') { e.preventDefault(); commitRawToTags(); return; }
                    if (e.key === 'Backspace' && valoresRaw.trim() === '' && valoresTags.length > 0) { e.preventDefault(); removeTagAt(valoresTags.length - 1); }
                    if (e.key === 'Delete' && valoresRaw.trim() === '' && valoresTags.length > 0) { e.preventDefault(); removeTagAt(valoresTags.length - 1); }
                  }}
                  placeholder={valoresTags.length ? 'Mais valores...' : 'Ex.: Branca, Vermelha, Dourada'}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="text-[11px] text-gray-400 mt-1.5">1 produto-filho por valor. Herda preço/unidade do pai.</div>
          </div>

          <div className="sm:col-span-6 flex justify-end">
            <button
              type="button"
              onClick={() => void handleGerar()}
              disabled={loading || !canUse || valores.length === 0}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold text-sm shadow-sm hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 flex items-center gap-2 transition-all"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              Gerar variações
            </button>
          </div>
        </div>
      </div>

      {/* Variants table */}
      <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100/80 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">Variações existentes</div>
          {variantes.length > 0 && (
            <span className="text-xs font-medium text-gray-400 bg-gray-100/60 px-2.5 py-1 rounded-lg">
              {variantes.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="px-5 py-12 text-sm text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={16} />
            Carregando variações...
          </div>
        ) : variantes.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Package size={36} className="mx-auto text-slate-200 mb-3" />
            <div className="text-sm text-gray-500">Nenhuma variação criada ainda.</div>
            <div className="text-xs text-gray-400 mt-1">Use o gerador acima para criar.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="pl-5 pr-2 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-10" />
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Variação</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">SKU</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">GTIN / EAN</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Preço</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Estoque</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider pr-5">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {variantes.map((v) => {
                  const href = `/app/products?open=${encodeURIComponent(v.id)}`;
                  const bc = barcodeByVariantId.get(v.id);
                  const effectiveBarcode = bc?.effective_barcode_value ?? null;
                  const stock = Number(v.estoque || 0);
                  const stockColor = stock <= 0 ? 'text-red-500' : stock < 5 ? 'text-amber-500' : 'text-emerald-600';

                  return (
                    <tr
                      key={v.id}
                      className="group hover:bg-blue-50/30 transition-colors cursor-pointer"
                      onDoubleClick={(e) => {
                        if (shouldIgnoreRowDoubleClickEvent(e)) return;
                        openInNewTabBestEffort(href);
                      }}
                    >
                      {/* Image thumbnail */}
                      <td className="pl-5 pr-2 py-2.5">
                        <div className="w-9 h-9 rounded-lg border border-slate-200/60 bg-slate-50/80 overflow-hidden flex items-center justify-center shrink-0">
                          {v.imagem_url ? (
                            <img src={v.imagem_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon size={14} className="text-slate-300" />
                          )}
                        </div>
                      </td>

                      {/* Name + attributes */}
                      <td className="px-3 py-2.5">
                        <a
                          href={href}
                          className="text-sm font-medium text-gray-800 hover:text-blue-600 transition-colors"
                          onClick={(e) => { if (!isPlainLeftClick(e)) return; e.preventDefault(); openInNewTabBestEffort(href); }}
                        >
                          {v.nome}
                        </a>
                        {v.atributos_summary && (
                          <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[220px]">{v.atributos_summary}</div>
                        )}
                      </td>

                      {/* SKU (editable) */}
                      <td className="px-3 py-2.5">
                        <InlineEditCell
                          value={v.sku || ''}
                          field="sku"
                          variantId={v.id}
                          onSaved={() => void reload()}
                        />
                      </td>

                      {/* GTIN */}
                      <td className="px-3 py-2.5">
                        {v.gtin ? (
                          <span className="text-xs font-mono text-gray-600 truncate max-w-[160px] block">{v.gtin}</span>
                        ) : effectiveBarcode ? (
                          <span className="text-xs font-mono text-gray-400 truncate max-w-[160px] block">{effectiveBarcode}</span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Price (editable) */}
                      <td className="px-3 py-2.5 text-right">
                        <InlineEditCell
                          value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v.preco_venda || 0))}
                          field="preco_venda"
                          variantId={v.id}
                          type="money"
                          onSaved={() => void reload()}
                        />
                      </td>

                      {/* Stock */}
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-sm font-medium tabular-nums ${stockColor}`}>
                          {formatStock(stock)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 pr-5">
                        <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title="Código de barras"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBarcodeVariant(v); }}
                            className="p-1.5 rounded-lg hover:bg-white/80 text-gray-500 hover:text-gray-800 transition-colors"
                          >
                            <Barcode size={15} />
                          </button>
                          <a
                            href={href}
                            title="Abrir em nova aba"
                            onClick={(e) => { if (!isPlainLeftClick(e)) return; e.preventDefault(); openInNewTabBestEffort(href); }}
                            className="p-1.5 rounded-lg hover:bg-white/80 text-gray-500 hover:text-gray-800 transition-colors"
                          >
                            <ExternalLink size={15} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Barcode modal */}
      <Modal
        isOpen={barcodeVariant != null}
        onClose={() => setBarcodeVariant(null)}
        title={barcodeVariant ? `Código de barras — ${barcodeVariant.nome}` : 'Código de barras'}
        size="3xl"
        closeOnEscape
      >
        <div className="p-4">
          <ProdutoCodigoBarrasSection
            produtoId={produtoId}
            varianteId={barcodeVariant?.id ?? null}
            produtoNome={barcodeVariant?.nome ?? null}
            sku={barcodeVariant?.sku ?? null}
            precoVenda={barcodeVariant?.preco_venda ?? null}
            onChanged={() => void reload()}
          />
        </div>
      </Modal>
    </div>
  );
}
