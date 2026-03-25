import React, { useState, useMemo, useCallback } from 'react';
import { FileSpreadsheet, Loader2, AlertTriangle, Mail, Check, RefreshCw, ChevronDown } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { formatDatePtBR } from '@/lib/dateDisplay';
import {
  listBatchBoletos,
  prepareBatchBoletos,
  processBatchBoletos,
  processSingleBoleto,
  type BatchBoletoItem,
  type BatchProgress,
  type BatchResult,
} from '@/services/servicosContratosBillingBatch';

// ── Helpers ──────────────────────────────────────────────

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const STATUS_MAP: Record<string, { bg: string; text: string; label: string }> = {
  pendente_emissao: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Pendente' },
  emitida:          { bg: 'bg-blue-50',  text: 'text-blue-700', label: 'Emitida' },
  registrada:       { bg: 'bg-blue-50',  text: 'text-blue-700', label: 'Registrada' },
  enviada:          { bg: 'bg-green-50',  text: 'text-green-700', label: 'Enviada' },
  liquidada:        { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Liquidada' },
  baixada:          { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Baixada' },
  cancelada:        { bg: 'bg-red-50',   text: 'text-red-700', label: 'Cancelada' },
  erro:             { bg: 'bg-red-50',   text: 'text-red-700', label: 'Erro' },
};

function StatusBadge({ status }: { status: string | null }) {
  const s = STATUS_MAP[status || ''] || { bg: 'bg-gray-100', text: 'text-gray-500', label: status || '—' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ── Component ────────────────────────────────────────────

export default function FaturamentoMensalPage() {
  const { addToast } = useToast();

  // Date selector
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // Data
  const [items, setItems] = useState<BatchBoletoItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);

  const competencia = `${year}-${String(month).padStart(2, '0')}-01`;

  // ── Summary stats ──
  const stats = useMemo(() => {
    const total = items.length;
    const totalValor = items.reduce((s, i) => s + (i.valor || 0), 0);
    const pendentes = items.filter(i => !i.cobranca_status || i.cobranca_status === 'pendente_emissao').length;
    const enviados = items.filter(i => i.cobranca_status === 'enviada').length;
    const registrados = items.filter(i => i.cobranca_status === 'registrada').length;
    const liquidados = items.filter(i => i.cobranca_status === 'liquidada' || i.cobranca_status === 'baixada').length;
    const semEmail = items.filter(i => !i.cliente_email).length;
    return { total, totalValor, pendentes, enviados, registrados, liquidados, semEmail };
  }, [items]);

  // ── Handlers ──
  const handleLoad = useCallback(async () => {
    setIsLoading(true);
    setResult(null);
    try {
      const data = await prepareBatchBoletos(competencia);
      setItems(data);
      setLoaded(true);
      setSelectedIds(new Set());
      if (data.length === 0) {
        addToast('Nenhum contrato ativo com regra de faturamento encontrado para este mês.', 'info');
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao carregar dados.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [competencia, addToast]);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listBatchBoletos(competencia);
      setItems(data);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao atualizar.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [competencia, addToast]);

  const toggleSelect = (scheduleId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.schedule_id)));
    }
  };

  const handleProcessBatch = useCallback(async () => {
    const selected = items.filter(i => selectedIds.has(i.schedule_id));
    if (selected.length === 0) {
      addToast('Selecione pelo menos um contrato.', 'info');
      return;
    }

    setIsProcessing(true);
    setProgress(null);
    setResult(null);

    const res = await processBatchBoletos(selected, (p) => setProgress(p));

    setResult(res);
    setIsProcessing(false);
    setProgress(null);

    // Refresh data
    try {
      const data = await listBatchBoletos(competencia);
      setItems(data);
    } catch { /* ignore */ }

    if (res.failed > 0) {
      addToast(`${res.success} enviados, ${res.failed} com erro, ${res.skipped} já processados.`, 'warning');
    } else {
      addToast(`${res.success} boletos emitidos e enviados com sucesso!`, 'success');
    }
  }, [items, selectedIds, competencia, addToast]);

  const handleProcessSingle = useCallback(async (item: BatchBoletoItem) => {
    if (!item.cobranca_bancaria_id) {
      addToast('Cobrança bancária não vinculada.', 'error');
      return;
    }
    if (!item.cliente_email) {
      addToast('Cliente sem email cadastrado.', 'error');
      return;
    }

    setIsProcessing(true);
    const res = await processSingleBoleto(item.cobranca_bancaria_id, item.cliente_email);
    setIsProcessing(false);

    if (res.ok) {
      addToast(`Boleto enviado para ${item.cliente_email}`, 'success');
      await handleRefresh();
    } else {
      addToast(res.error || 'Erro ao processar boleto.', 'error');
    }
  }, [addToast, handleRefresh]);

  // ── Year options ──
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const selectableCount = items.filter(
    i => !i.cobranca_status || !['enviada', 'liquidada', 'baixada'].includes(i.cobranca_status)
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Faturamento Mensal</h1>
          <p className="text-sm text-gray-500">Emita boletos em lote e envie por email aos clientes</p>
        </div>
      </div>

      {/* Month selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mês</label>
            <div className="relative">
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                disabled={isProcessing}
                className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
            <div className="relative">
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                disabled={isProcessing}
                className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <button
            onClick={handleLoad}
            disabled={isLoading || isProcessing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loaded ? 'Atualizar' : 'Carregar'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {loaded && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard label="Contratos" value={String(stats.total)} color="blue" />
          <SummaryCard label="Total" value={fmtMoney(stats.totalValor)} color="emerald" />
          <SummaryCard label="Pendentes" value={String(stats.pendentes)} color="gray" />
          <SummaryCard label="Enviados" value={String(stats.enviados)} color="green" />
          <SummaryCard label="Liquidados" value={String(stats.liquidados)} color="emerald" />
        </div>
      )}

      {/* Batch actions + progress */}
      {loaded && items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === items.length && items.length > 0}
                  onChange={toggleAll}
                  disabled={isProcessing}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Selecionar todos ({items.length})
              </label>
              {stats.semEmail > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  {stats.semEmail} sem email
                </span>
              )}
            </div>
            <button
              onClick={handleProcessBatch}
              disabled={isProcessing || selectedIds.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Emitir e Enviar ({selectedIds.size})
            </button>
          </div>

          {/* Progress bar */}
          {isProcessing && progress && (
            <div>
              <div className="flex items-center justify-between text-sm text-gray-600 mb-1.5">
                <span className="truncate max-w-xs">
                  {progress.status === 'registering' && 'Registrando boleto — '}
                  {progress.status === 'sending' && 'Enviando email — '}
                  {progress.currentItem}
                </span>
                <span className="font-medium tabular-nums">{progress.current}/{progress.total}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Result summary */}
          {result && !isProcessing && (
            <div className={`rounded-lg p-3 text-sm ${result.failed > 0 ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
              <div className="font-medium">
                {result.success} enviados com sucesso
                {result.skipped > 0 && ` | ${result.skipped} já processados`}
                {result.failed > 0 && ` | ${result.failed} com erro`}
              </div>
              {result.errors.length > 0 && (
                <ul className="mt-1 text-xs space-y-0.5">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e.contrato}: {e.error}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>...e mais {result.errors.length - 5} erros</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {loaded && items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === items.length && items.length > 0}
                      onChange={toggleAll}
                      disabled={isProcessing}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(item => {
                  const isDone = item.cobranca_status && ['enviada', 'liquidada', 'baixada'].includes(item.cobranca_status);
                  return (
                    <tr
                      key={item.schedule_id}
                      className={`${selectedIds.has(item.schedule_id) ? 'bg-blue-50/40' : 'hover:bg-gray-50/50'} transition-colors`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.schedule_id)}
                          onChange={() => toggleSelect(item.schedule_id)}
                          disabled={isProcessing}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {item.contrato_numero || '(s/n)'}
                        </div>
                        {item.contrato_descricao && (
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">
                            {item.contrato_descricao}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{item.cliente_nome}</div>
                        {item.cliente_email ? (
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">{item.cliente_email}</div>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="w-3 h-3" />
                            Sem email
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 tabular-nums">
                        {fmtMoney(item.valor || 0)}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600 tabular-nums">
                        {formatDatePtBR(item.data_vencimento)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={item.cobranca_status} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isDone ? (
                          <button
                            onClick={() => handleProcessSingle(item)}
                            disabled={isProcessing || !item.cliente_email}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-40 transition-colors"
                            title="Reenviar email"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Reenviar
                          </button>
                        ) : item.cobranca_bancaria_id ? (
                          <button
                            onClick={() => handleProcessSingle(item)}
                            disabled={isProcessing || !item.cliente_email}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
                            title="Emitir boleto e enviar email"
                          >
                            <Mail className="w-3 h-3" />
                            Emitir
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {loaded && items.length === 0 && !isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900">Nenhum contrato encontrado</h3>
          <p className="text-sm text-gray-500 mt-1">
            Não há contratos ativos com regra de faturamento mensal para {MONTHS[month - 1]} {year}.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Summary Card ─────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    gray: 'bg-gray-50 text-gray-700 border-gray-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  const cls = colorMap[color] || colorMap.gray;
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
