import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Wand2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { ensureAtributo, generateVariantes, listAtributos, listVariantes, type AtributoRow, type VariantRow } from '@/services/productVariants';
import { openInNewTabBestEffort, shouldIgnoreRowDoubleClickEvent } from '@/components/ui/table/rowDoubleClick';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';

type Props = {
  produtoId: string | null | undefined;
  produtoPaiId: string | null | undefined;
  skuBase?: string | null | undefined;
};

function splitValores(raw: string): string[] {
  return raw
    .split(/[,\n;]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function VariacoesTab({ produtoId, produtoPaiId, skuBase }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [atributos, setAtributos] = useState<AtributoRow[]>([]);
  const [variantes, setVariantes] = useState<VariantRow[]>([]);
  const [atributoId, setAtributoId] = useState<string>('');
  const [novoAtributoNome, setNovoAtributoNome] = useState('Cor');
  const [valoresRaw, setValoresRaw] = useState('');
  const [valoresTags, setValoresTags] = useState<string[]>([]);
  const [skuSuffixMode, setSkuSuffixMode] = useState<'slug' | 'num'>('slug');

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

  const reload = async () => {
    if (!produtoId) return;
    setLoading(true);
    try {
      const [attrs, vars] = await Promise.all([
        listAtributos(),
        produtoPaiId ? Promise.resolve([] as VariantRow[]) : listVariantes(produtoId),
      ]);
      setAtributos(attrs ?? []);
      setVariantes(vars ?? []);
      if (!atributoId) {
        const cor = (attrs ?? []).find((a) => a.nome.toLowerCase() === 'cor');
        if (cor) setAtributoId(cor.id);
      }
    } catch (e: any) {
      addToast(e?.message || 'Não foi possível carregar variações.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId]);

  const handleGerar = async () => {
    if (!produtoId) {
      addToast('Salve o produto antes de criar variações.', 'warning');
      return;
    }
    if (produtoPaiId) {
      addToast('Este produto já é uma variação (não pode ter variações).', 'warning');
      return;
    }
    if (valores.length === 0) {
      addToast('Informe ao menos 1 valor (ex.: Branca, Vermelha, Dourada).', 'warning');
      return;
    }

    setLoading(true);
    try {
      let finalAtributoId = atributoId;
      if (!finalAtributoId) {
        finalAtributoId = await ensureAtributo({ nome: novoAtributoNome, tipo: 'text' });
        setAtributoId(finalAtributoId);
      }

      const created = await generateVariantes({
        produtoPaiId: produtoId,
        atributoId: finalAtributoId,
        valores,
        skuSuffixMode,
      });

      addToast(`Variações criadas: ${created?.length ?? 0}.`, 'success');
      setValoresRaw('');
      setValoresTags([]);
      await reload();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar variações.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const normalizeToken = (raw: string): string | null => {
    const clean = raw.trim().replace(/\s+/g, ' ');
    if (!clean) return null;
    return clean;
  };

  const commitRawToTags = () => {
    const tokens = splitValores(valoresRaw).map((t) => normalizeToken(t)).filter(Boolean) as string[];
    if (tokens.length === 0) return;
    setValoresTags((prev) => {
      const next = [...prev];
      const existing = new Set(prev.map((x) => x.toLowerCase()));
      for (const t of tokens) {
        const key = t.toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        next.push(t);
      }
      return next;
    });
    setValoresRaw('');
  };

  const removeTagAt = (index: number) => {
    setValoresTags((prev) => prev.filter((_, i) => i !== index));
  };

  if (!produtoId) {
    return (
      <div className="p-6 bg-white rounded-lg border border-gray-100">
        <div className="text-gray-700 font-semibold">Variações</div>
        <div className="text-sm text-gray-600 mt-1">Salve o produto primeiro para liberar a criação de variações.</div>
      </div>
    );
  }

  if (produtoPaiId) {
    return (
      <div className="p-6 bg-white rounded-lg border border-gray-100">
        <div className="text-gray-700 font-semibold">Variações</div>
        <div className="text-sm text-gray-600 mt-1">
          Este produto é uma variação (produto filho). Variações são gerenciadas no produto pai.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-6 bg-white rounded-lg border border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-gray-900 font-semibold">Variações (SKU filhos)</div>
            <div className="text-sm text-gray-600 mt-1">
              Ex.: <span className="font-semibold">Vela Palito</span> → Branca / Vermelha / Dourada (sem duplicar cadastro manualmente).
            </div>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="p-6 bg-white rounded-lg border border-gray-100">
        <div className="flex items-center gap-2 text-gray-900 font-semibold">
          <Wand2 size={18} />
          Gerar variações
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 mt-4">
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Atributo</label>
            <select
              className="w-full p-3 border border-gray-300 rounded-lg"
              value={atributoId}
              onChange={(e) => setAtributoId(e.target.value)}
              disabled={loading}
            >
              <option value="">Criar/usar “{novoAtributoNome}”</option>
              {atributos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
            {!atributoId ? (
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome do atributo (novo)</label>
                <input
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  value={novoAtributoNome}
                  onChange={(e) => setNovoAtributoNome(e.target.value)}
                  disabled={loading}
                  placeholder="Ex.: Cor"
                />
              </div>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU suffix</label>
            <select
              className="w-full p-3 border border-gray-300 rounded-lg"
              value={skuSuffixMode}
              onChange={(e) => setSkuSuffixMode(e.target.value as any)}
              disabled={loading}
            >
              <option value="slug">Slug (BRANCA → branca)</option>
              <option value="num">Numérico (01, 02...)</option>
            </select>
            <div className="text-xs text-gray-500 mt-1">Base: {skuBase || '—'}.</div>
          </div>

          <div className="sm:col-span-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Valores (separados por vírgula)</label>
            <div className="w-full p-2 border border-gray-300 rounded-lg bg-white min-h-[56px] focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-300">
              <div className="flex flex-wrap gap-2">
                {valoresTags.map((tag, idx) => (
                  <button
                    key={`${tag}:${idx}`}
                    type="button"
                    onClick={() => removeTagAt(idx)}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 text-sm border border-gray-200 hover:bg-gray-200"
                    disabled={loading}
                    aria-label={`Remover ${tag}`}
                    title="Remover"
                  >
                    <span className="max-w-[240px] truncate">{tag}</span>
                    <span className="text-gray-500">×</span>
                  </button>
                ))}
                <input
                  className="flex-1 min-w-[180px] px-2 py-2 text-sm outline-none bg-transparent"
                  value={valoresRaw}
                  onChange={(e) => setValoresRaw(e.target.value)}
                  onBlur={() => commitRawToTags()}
                  onKeyDown={(e) => {
                    if (e.key === ',' || e.key === 'Tab') {
                      e.preventDefault();
                      commitRawToTags();
                      return;
                    }
                    if (e.key === 'Backspace' && valoresRaw.trim() === '' && valoresTags.length > 0) {
                      e.preventDefault();
                      removeTagAt(valoresTags.length - 1);
                      return;
                    }
                    if (e.key === 'Delete' && valoresRaw.trim() === '' && valoresTags.length > 0) {
                      e.preventDefault();
                      removeTagAt(valoresTags.length - 1);
                    }
                  }}
                  placeholder={valoresTags.length ? 'Digite e use vírgula ou Tab…' : 'Ex.: Branca, Vermelha, Dourada'}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Será criado 1 produto por valor. Preço/unidade e demais campos são herdados do produto pai.
            </div>
          </div>

          <div className="sm:col-span-6 flex justify-end">
            <button
              type="button"
              onClick={() => void handleGerar()}
              disabled={loading || !canUse || valores.length === 0}
              className="px-4 py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
              Gerar variações
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 bg-white rounded-lg border border-gray-100">
        <div className="flex items-center justify-between">
          <div className="text-gray-900 font-semibold">Variações existentes</div>
          <div className="text-sm text-gray-600">{variantes.length}</div>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Dica: duplo clique (ou ctrl/cmd+clique / botão do meio) para abrir a variação em outra aba.
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-gray-600 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} />
            Carregando…
          </div>
        ) : variantes.length === 0 ? (
          <div className="mt-4 text-sm text-gray-600">Nenhuma variação criada ainda.</div>
        ) : (
          <div className="mt-4 overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 bg-white">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Nome</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Unidade</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Preço</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {variantes.map((v) => {
                  const href = `/app/products?open=${encodeURIComponent(v.id)}`;
                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onDoubleClick={(e) => {
                        if (shouldIgnoreRowDoubleClickEvent(e)) return;
                        openInNewTabBestEffort(href);
                      }}
                    >
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <a
                        href={href}
                        className="hover:underline underline-offset-2"
                        onClick={(e) => {
                          if (!isPlainLeftClick(e)) return;
                          e.preventDefault();
                          openInNewTabBestEffort(href);
                        }}
                      >
                        {v.nome}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">{v.sku || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{v.unidade}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v.preco_venda || 0))}
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
