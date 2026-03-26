import React, { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { AlertTriangle, Hash, Loader2 } from 'lucide-react';
import {
  fiscalNfeInutilizar,
  fiscalNfeInutilizacoesList,
  type InutilizacaoRow,
} from '@/services/fiscalNfeEmissoes';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  autorizada: { label: 'Autorizada', className: 'bg-emerald-100 text-emerald-800' },
  erro: { label: 'Erro', className: 'bg-red-100 text-red-800' },
  processando: { label: 'Processando', className: 'bg-amber-100 text-amber-800' },
};

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

export default function NfeInutilizacaoPage() {
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const empresaId = activeEmpresa?.id;

  // Form state
  const [serie, setSerie] = useState('1');
  const [numeroInicial, setNumeroInicial] = useState('');
  const [numeroFinal, setNumeroFinal] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // History state
  const [history, setHistory] = useState<InutilizacaoRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!empresaId) return;
    setLoadingHistory(true);
    try {
      const data = await fiscalNfeInutilizacoesList({ limit: 100 });
      setHistory(data ?? []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const isFormValid =
    serie.trim() !== '' &&
    numeroInicial.trim() !== '' &&
    numeroFinal.trim() !== '' &&
    Number(numeroFinal) >= Number(numeroInicial) &&
    Number(numeroInicial) > 0 &&
    justificativa.trim().length >= 15;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setSubmitting(true);
    try {
      const res = await fiscalNfeInutilizar({
        serie: Number(serie),
        numero_inicial: Number(numeroInicial),
        numero_final: Number(numeroFinal),
        justificativa: justificativa.trim(),
      });
      if (res.ok) {
        addToast(
          `Numeração inutilizada com sucesso${res.protocolo ? ` (protocolo: ${res.protocolo})` : ''}.`,
          'success',
        );
        setNumeroInicial('');
        setNumeroFinal('');
        setJustificativa('');
        await fetchHistory();
      } else {
        addToast(res.detail || res.mensagem_sefaz || res.error || 'Erro ao inutilizar numeração.', 'error');
        await fetchHistory();
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao inutilizar numeração.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!empresaId) {
    return (
      <div className="p-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-700">Selecione uma empresa ativa para acessar a inutilização.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-1">
      <div className="mb-6">
        <PageHeader
          title="Inutilização de Numeração NF-e"
          description="Declare à SEFAZ que números de NF-e não serão utilizados, evitando lacunas na sequência."
          icon={<Hash size={20} />}
        />
      </div>

      {/* Form Card */}
      <GlassCard className="p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Nova Inutilização</h2>

        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 mb-5">
          <p className="text-sm text-blue-800">
            A inutilização deve ser feita quando há lacunas na numeração das NF-e (números que foram pulados e nunca serão utilizados). O prazo é até o dia 10 do mês seguinte ao da ocorrência.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Série</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border border-slate-300 bg-white/80 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={serie}
              onChange={(e) => setSerie(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Número Inicial</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border border-slate-300 bg-white/80 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Ex: 101"
              value={numeroInicial}
              onChange={(e) => {
                setNumeroInicial(e.target.value);
                if (!numeroFinal) setNumeroFinal(e.target.value);
              }}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Número Final</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border border-slate-300 bg-white/80 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Ex: 105"
              value={numeroFinal}
              onChange={(e) => setNumeroFinal(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Justificativa <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full rounded-xl border border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            rows={3}
            maxLength={255}
            placeholder="Motivo da inutilização (mínimo 15 caracteres)"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            disabled={submitting}
          />
          <div className="text-xs text-slate-400 text-right mt-1">{justificativa.length}/255</div>
        </div>

        {numeroFinal && numeroInicial && Number(numeroFinal) < Number(numeroInicial) ? (
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-600" />
            <span className="text-sm text-red-800">Número final deve ser maior ou igual ao número inicial.</span>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            onClick={() => void handleSubmit()}
            disabled={!isFormValid || submitting}
          >
            {submitting ? <Loader2 size={18} className="animate-spin mr-2" /> : <Hash size={18} className="mr-2" />}
            Inutilizar Números
          </Button>
        </div>
      </GlassCard>

      {/* History Card */}
      <GlassCard className="p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Histórico de Inutilizações</h2>

        {loadingHistory ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">Nenhuma inutilização registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-2 px-3 font-semibold text-slate-700">Série</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">Nº Inicial</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">Nº Final</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">Qtd</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">Status</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">Protocolo</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">Data</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">Justificativa</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const badge = STATUS_BADGE[row.status] || { label: row.status, className: 'bg-slate-100 text-slate-700' };
                  return (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-mono">{row.serie}</td>
                      <td className="py-2.5 px-3 font-mono">{row.numero_inicial}</td>
                      <td className="py-2.5 px-3 font-mono">{row.numero_final}</td>
                      <td className="py-2.5 px-3">{row.numero_final - row.numero_inicial + 1}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                        {row.status === 'erro' && row.mensagem_sefaz ? (
                          <div className="text-xs text-red-600 mt-1">{row.mensagem_sefaz}</div>
                        ) : null}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs">{row.protocolo || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600">{formatDate(row.created_at)}</td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate" title={row.justificativa}>
                        {row.justificativa}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
