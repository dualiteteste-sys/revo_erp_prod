import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { listTabelasPreco, type TabelaPrecoRow } from '@/services/pricing';
import { deleteFaixaPreco, listFaixasPreco, upsertFaixaPreco, type FaixaPrecoRow } from '@/services/pricingTiers';

type Props = {
  produtoId: string | null | undefined;
};

type EditableFaixa = {
  id?: string;
  min_qtd: number;
  max_qtd: number | null;
  preco_unitario: number;
  isNew?: boolean;
};

function toNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function PrecosTab({ produtoId }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [tabelas, setTabelas] = useState<TabelaPrecoRow[]>([]);
  const [tabelaId, setTabelaId] = useState<string>('');
  const [faixas, setFaixas] = useState<EditableFaixa[]>([]);

  const hasProduto = !!produtoId;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const rows = await listTabelasPreco();
        setTabelas(rows ?? []);
        const varejo = (rows ?? []).find((t) => t.slug === 'varejo');
        setTabelaId((prev) => prev || (varejo?.id ?? (rows?.[0]?.id ?? '')));
      } catch (e: any) {
        addToast(e?.message || 'Não foi possível carregar tabelas de preço.', 'error');
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadFaixas = async () => {
    if (!produtoId || !tabelaId) return;
    setLoading(true);
    try {
      const rows = await listFaixasPreco({ produtoId, tabelaPrecoId: tabelaId });
      setFaixas(
        (rows ?? []).map((r: FaixaPrecoRow) => ({
          id: r.id,
          min_qtd: Number(r.min_qtd),
          max_qtd: r.max_qtd == null ? null : Number(r.max_qtd),
          preco_unitario: Number(r.preco_unitario),
        }))
      );
    } catch (e: any) {
      addToast(e?.message || 'Não foi possível carregar faixas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadFaixas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId, tabelaId]);

  const canEdit = useMemo(() => hasProduto && !!tabelaId, [hasProduto, tabelaId]);

  const addRow = () => {
    setFaixas((prev) => [
      ...prev,
      {
        min_qtd: 1,
        max_qtd: null,
        preco_unitario: 0,
        isNew: true,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<EditableFaixa>) => {
    setFaixas((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSaveRow = async (idx: number) => {
    if (!produtoId || !tabelaId) return;
    const row = faixas[idx];
    if (!row) return;

    if (row.min_qtd <= 0) {
      addToast('min_qtd deve ser > 0.', 'warning');
      return;
    }
    if (row.max_qtd != null && row.max_qtd < row.min_qtd) {
      addToast('max_qtd deve ser >= min_qtd.', 'warning');
      return;
    }
    if (row.preco_unitario < 0) {
      addToast('preço unitário deve ser >= 0.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const id = await upsertFaixaPreco({
        id: row.id ?? null,
        produtoId,
        tabelaPrecoId: tabelaId,
        minQtd: row.min_qtd,
        maxQtd: row.max_qtd,
        precoUnitario: row.preco_unitario,
      });
      updateRow(idx, { id, isNew: false });
      addToast('Faixa salva.', 'success');
      await reloadFaixas();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar faixa.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRow = async (idx: number) => {
    const row = faixas[idx];
    if (!row) return;
    if (!row.id) {
      setFaixas((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    setLoading(true);
    try {
      await deleteFaixaPreco(row.id);
      addToast('Faixa removida.', 'success');
      await reloadFaixas();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao remover faixa.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!produtoId) {
    return (
      <div className="p-6 bg-white rounded-lg border border-gray-100">
        <div className="text-gray-700 font-semibold">Preço por quantidade (faixas)</div>
        <div className="text-sm text-gray-600 mt-1">Salve o produto primeiro para configurar preço por quantidade.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-6 bg-white rounded-lg border border-gray-100">
        <div className="text-gray-900 font-semibold">Preço por quantidade (faixas)</div>
        <div className="text-sm text-gray-600 mt-1">
          Estado da arte para atacado/varejo: defina faixas de quantidade por tabela de preço (ex.: 0,200kg; 0,300kg…).
        </div>
      </div>

      <div className="p-6 bg-white rounded-lg border border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Tabela</label>
            <select
              className="p-2 border border-gray-300 rounded-lg text-sm"
              value={tabelaId}
              onChange={(e) => setTabelaId(e.target.value)}
              disabled={loading}
            >
              {tabelas
                .filter((t) => t.status !== 'inativa')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
            </select>
          </div>
          <button
            type="button"
            className="px-3 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            onClick={addRow}
            disabled={!canEdit || loading}
          >
            <Plus size={16} />
            Nova faixa
          </button>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-gray-600 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} />
            Carregando…
          </div>
        ) : faixas.length === 0 ? (
          <div className="mt-4 text-sm text-gray-600">Nenhuma faixa configurada.</div>
        ) : (
          <div className="mt-4 overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 bg-white">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Min</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Max</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Preço unit.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {faixas.map((r, idx) => (
                  <tr key={r.id ?? `new-${idx}`}>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full p-2 border rounded text-sm text-right"
                        value={r.min_qtd}
                        min="0.001"
                        step="any"
                        onChange={(e) => updateRow(idx, { min_qtd: toNumber(e.target.value) })}
                        disabled={loading}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full p-2 border rounded text-sm text-right"
                        value={r.max_qtd ?? ''}
                        min="0.001"
                        step="any"
                        onChange={(e) => updateRow(idx, { max_qtd: e.target.value === '' ? null : toNumber(e.target.value) })}
                        disabled={loading}
                        placeholder="(sem limite)"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-xs text-gray-500">R$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full p-2 border rounded text-sm text-right pl-8"
                          value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.preco_unitario || 0)}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\\D/g, '');
                            const numberValue = digits ? parseInt(digits, 10) / 100 : 0;
                            updateRow(idx, { preco_unitario: numberValue });
                          }}
                          disabled={loading}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold flex items-center gap-2"
                          onClick={() => void handleSaveRow(idx)}
                          disabled={loading}
                        >
                          <Save size={16} />
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-sm font-semibold text-red-700 flex items-center gap-2"
                          onClick={() => void handleDeleteRow(idx)}
                          disabled={loading}
                        >
                          <Trash2 size={16} />
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

