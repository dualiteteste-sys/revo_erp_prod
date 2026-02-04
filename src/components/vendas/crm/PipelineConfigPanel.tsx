import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, PlusCircle, Save, Trash2 } from 'lucide-react';
import { ensureDefaultPipeline, getPipelineConfig, type CrmPipelineEtapa, upsertEtapa, deleteEtapa, reorderEtapas } from '@/services/crm';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';

type Row = CrmPipelineEtapa & { _dirty?: boolean };

export default function PipelineConfigPanel(props: { onChanged?: () => void }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [funilId, setFunilId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const ordered = useMemo(() => [...rows].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)), [rows]);

  const load = async () => {
    setLoading(true);
    try {
      let cfg = await getPipelineConfig();
      if (!cfg?.funil_id) {
        await ensureDefaultPipeline();
        cfg = await getPipelineConfig();
      }
      setFunilId(cfg.funil_id || null);
      setRows((cfg.etapas || []).map((e) => ({ ...e, _dirty: false })));
    } catch (e: any) {
      addToast(e.message || 'Erro ao carregar configurações do funil.', 'error');
      setRows([]);
      setFunilId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markDirty = (id: string, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, _dirty: true } : r))
    );
  };

  const addRow = () => {
    if (!funilId) return;
    const last = ordered.length > 0 ? ordered[ordered.length - 1] : undefined;
    const nextOrder = (last?.ordem ?? 0) + 1;
    const tempId = `temp-${Math.random().toString(16).slice(2)}`;
    setRows((prev) => [
      ...prev,
      {
        id: tempId,
        nome: 'Nova etapa',
        ordem: nextOrder,
        cor: 'bg-gray-100',
        probabilidade: 0,
        _dirty: true,
      } as any,
    ]);
  };

  const move = async (id: string, dir: -1 | 1) => {
    if (!funilId) return;
    const idx = ordered.findIndex((r) => r.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;

    const next = [...ordered];
    const tmp = next[idx];
    next[idx] = next[swapIdx];
    next[swapIdx] = tmp;

    const etapaIds = next.map((r) => r.id).filter((x) => !String(x).startsWith('temp-'));
    setRows(next.map((r, i) => ({ ...r, ordem: i + 1 })));

    try {
      await reorderEtapas(funilId, etapaIds);
      props.onChanged?.();
    } catch (e: any) {
      addToast(e.message || 'Falha ao reordenar etapas.', 'error');
      await load();
    }
  };

  const saveAll = async () => {
    if (!funilId) {
      addToast('Funil não identificado.', 'error');
      return;
    }
    const dirty = ordered.filter((r) => r._dirty);
    if (dirty.length === 0) {
      addToast('Nenhuma alteração pendente.', 'info');
      return;
    }

    setSaving(true);
    try {
      // salva (cria/atualiza)
      const persistedIds: string[] = [];
      for (const r of ordered) {
        if (String(r.id).startsWith('temp-')) {
          const newId = await upsertEtapa({
            funil_id: funilId,
            nome: r.nome,
            ordem: r.ordem,
            probabilidade: r.probabilidade ?? 0,
            cor: r.cor ?? null,
          });
          persistedIds.push(newId);
        } else {
          persistedIds.push(r.id);
          if (r._dirty) {
            await upsertEtapa({
              id: r.id,
              funil_id: funilId,
              nome: r.nome,
              ordem: r.ordem,
              probabilidade: r.probabilidade ?? 0,
              cor: r.cor ?? null,
            });
          }
        }
      }

      // reordena para refletir ordem atual (somente ids persistidos)
      await reorderEtapas(funilId, persistedIds);

      addToast('Etapas atualizadas.', 'success');
      props.onChanged?.();
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar etapas.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!funilId) return;
    if (String(row.id).startsWith('temp-')) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    try {
      await deleteEtapa(row.id);
      addToast('Etapa removida.', 'success');
      props.onChanged?.();
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao remover etapa.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-600">
        <Loader2 className="animate-spin" size={18} /> Carregando…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <Section
        title="Etapas do Funil"
        description="Configure as etapas do CRM (nome, probabilidade e ordem)."
      >
        {!funilId ? (
          <div className="sm:col-span-6 text-sm text-gray-500">Nenhum funil encontrado.</div>
        ) : (
          <div className="sm:col-span-6 space-y-3">
            {ordered.length === 0 ? (
              <div className="text-sm text-gray-500">Nenhuma etapa cadastrada.</div>
            ) : (
              <div className="divide-y border rounded-lg bg-white">
                {ordered.map((r) => (
                  <div key={r.id} className="p-3 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 md:col-span-5">
                      <input
                        value={r.nome}
                        onChange={(e) => markDirty(r.id, { nome: e.target.value })}
                        className="w-full p-2 border border-gray-200 rounded-md"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Number(r.probabilidade ?? 0)}
                        onChange={(e) => markDirty(r.id, { probabilidade: Number(e.target.value || 0) })}
                        className="w-full p-2 border border-gray-200 rounded-md"
                        title="Probabilidade (%)"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <select
                        value={r.cor ?? 'bg-gray-100'}
                        onChange={(e) => markDirty(r.id, { cor: e.target.value })}
                        className="w-full p-2 border border-gray-200 rounded-md"
                        title="Cor"
                      >
                        <option value="bg-gray-100">Cinza</option>
                        <option value="bg-blue-100">Azul</option>
                        <option value="bg-yellow-100">Amarelo</option>
                        <option value="bg-orange-100">Laranja</option>
                        <option value="bg-green-100">Verde</option>
                        <option value="bg-red-100">Vermelho</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-2 flex justify-end gap-1">
                      <button
                        onClick={() => move(r.id, -1)}
                        className="p-2 rounded-md bg-gray-100 hover:bg-gray-200"
                        title="Mover para cima"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        onClick={() => move(r.id, 1)}
                        className="p-2 rounded-md bg-gray-100 hover:bg-gray-200"
                        title="Mover para baixo"
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        onClick={() => remove(r)}
                        className="p-2 rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                        title="Remover"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={addRow}
                disabled={!funilId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                <PlusCircle size={18} /> Adicionar etapa
              </button>
              <button
                onClick={saveAll}
                disabled={!funilId || saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Salvar alterações
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
