import React, { useEffect, useState } from 'react';
import { listAutomacaoRegras, upsertAutomacaoRegra } from '@/services/industriaAutomacao';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2, Bot } from 'lucide-react';

type FormState = {
  auto_avancar: boolean;
  alerta_parada_minutos: number;
  alerta_refugo_percent: number;
};

export default function AutomacaoPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    auto_avancar: true,
    alerta_parada_minutos: 20,
    alerta_refugo_percent: 5,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const regras = await listAutomacaoRegras();
        const next: FormState = { ...form };
        for (const r of regras) {
          if (r.chave === 'auto_avancar') next.auto_avancar = !!r.enabled;
          if (r.chave === 'alerta_parada') next.alerta_parada_minutos = Number(r.config?.minutos ?? next.alerta_parada_minutos);
          if (r.chave === 'alerta_refugo') next.alerta_refugo_percent = Number(r.config?.percent ?? next.alerta_refugo_percent);
        }
        setForm(next);
      } catch (e: any) {
        addToast(e.message || 'Falha ao carregar automações.', 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsertAutomacaoRegra('auto_avancar', form.auto_avancar, {}),
        upsertAutomacaoRegra('alerta_parada', true, { minutos: Math.max(1, Number(form.alerta_parada_minutos) || 1) }),
        upsertAutomacaoRegra('alerta_refugo', true, { percent: Math.max(0, Number(form.alerta_refugo_percent) || 0) }),
      ]);
      addToast('Regras de automação atualizadas.', 'success');
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar automações.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="text-blue-600" size={20} /> Automação (Chão de Fábrica)
          </h1>
          <p className="text-sm text-gray-500">Regras para auto-avanço e alertas de exceção.</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar
        </button>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Auto-avançar próxima operação</h2>
            <p className="text-sm text-gray-500">Ao concluir uma operação, libera automaticamente a próxima etapa da ordem.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.auto_avancar}
              onChange={(e) => setForm((p) => ({ ...p, auto_avancar: e.target.checked }))}
              className="w-5 h-5"
            />
            Ativo
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-2xl p-5">
            <h3 className="font-semibold text-gray-900 mb-1">Alerta de parada</h3>
            <p className="text-sm text-gray-500 mb-3">Marca como “parada” se ficar sem atualização por X minutos em execução.</p>
            <label className="text-sm font-semibold text-gray-700">Minutos</label>
            <input
              type="number"
              min={1}
              value={form.alerta_parada_minutos}
              onChange={(e) => setForm((p) => ({ ...p, alerta_parada_minutos: Number(e.target.value) }))}
              className="mt-1 w-full border rounded-xl px-3 py-2"
            />
          </div>
          <div className="border rounded-2xl p-5">
            <h3 className="font-semibold text-gray-900 mb-1">Alerta/Bloqueio por refugo</h3>
            <p className="text-sm text-gray-500 mb-3">Ao concluir, se refugo % ≥ limite, operação vai para “em espera”.</p>
            <label className="text-sm font-semibold text-gray-700">Percentual (%)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={form.alerta_refugo_percent}
              onChange={(e) => setForm((p) => ({ ...p, alerta_refugo_percent: Number(e.target.value) }))}
              className="mt-1 w-full border rounded-xl px-3 py-2"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

