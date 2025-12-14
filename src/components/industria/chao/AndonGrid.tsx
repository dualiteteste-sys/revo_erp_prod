import React from 'react';
import { CentroStatusSnapshot } from '@/services/industriaExecucao';
import { Activity, AlertTriangle, CheckCircle2, Clock, Factory, PauseCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatOrderNumber } from '@/lib/utils';

type Props = {
  data: CentroStatusSnapshot[];
  tvMode?: boolean;
  connected: boolean;
  lastPulse?: Date | null;
};

const ALERT_STYLES = {
  ok: {
    label: 'Fluxo normal',
    ring: 'ring-emerald-300/50',
    chip: 'bg-emerald-100 text-emerald-700',
    accent: 'from-emerald-400 to-emerald-600',
  },
  warning: {
    label: 'Atenção',
    ring: 'ring-amber-300/40',
    chip: 'bg-amber-100 text-amber-700',
    accent: 'from-amber-400 to-amber-600',
  },
  danger: {
    label: 'Parada/Bloqueio',
    ring: 'ring-rose-400/40',
    chip: 'bg-rose-100 text-rose-700',
    accent: 'from-rose-500 to-rose-700',
  },
} as const;

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return format(new Date(iso), "dd/MM HH:mm", { locale: ptBR });
  } catch {
    return '—';
  }
};

const formatRelative = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '—';
  }
};

export const AndonGrid: React.FC<Props> = ({ data, tvMode = false, connected, lastPulse }) => {
  const lastPulseRelative = lastPulse
    ? formatDistanceToNow(lastPulse, { addSuffix: true, locale: ptBR })
    : null;

  const indicatorClasses = connected
    ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse'
    : 'bg-gray-400';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            connected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${indicatorClasses}`} />
          {connected ? 'Ao vivo' : 'Offline'}
        </span>
        {lastPulseRelative && (
          <span className="text-xs text-gray-500">
            Último evento {lastPulseRelative}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
        {data.map((snapshot) => {
          const palette = ALERT_STYLES[snapshot.alerta];
          const focusOp =
            snapshot.emExecucao[0] ||
            snapshot.bloqueadas[0] ||
            snapshot.fila[0];

          return (
            <div
              key={snapshot.centro.id}
              className={`relative overflow-hidden rounded-3xl border p-5 ring-1 ${
                tvMode
                  ? 'bg-slate-900/80 text-white border-slate-800'
                  : 'bg-white text-gray-900 border-slate-100 shadow-sm'
              } ${palette.ring}`}
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${palette.accent}`}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-xs uppercase tracking-wide ${tvMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    Centro
                  </p>
                  <h3 className="text-2xl font-bold flex items-center gap-2">
                    <Factory size={20} className="text-blue-400" />
                    {snapshot.centro.nome}
                  </h3>
                  {snapshot.centro.codigo && (
                    <p className={`text-sm ${tvMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      {snapshot.centro.codigo}
                    </p>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${palette.chip}`}>
                  {palette.label}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div
                  className={`rounded-2xl p-3 ${
                    tvMode ? 'bg-white/5' : 'bg-gray-50'
                  }`}
                >
                  <p className={`text-xs uppercase ${tvMode ? 'text-slate-300' : 'text-gray-500'}`}>
                    Execução
                  </p>
                  <p className="text-2xl font-bold">{snapshot.emExecucao.length}</p>
                </div>
                <div
                  className={`rounded-2xl p-3 ${
                    tvMode ? 'bg-white/5' : 'bg-gray-50'
                  }`}
                >
                  <p className={`text-xs uppercase ${tvMode ? 'text-slate-300' : 'text-gray-500'}`}>
                    Fila
                  </p>
                  <p className="text-2xl font-bold">{snapshot.fila.length}</p>
                </div>
                <div
                  className={`rounded-2xl p-3 ${
                    tvMode ? 'bg-white/5' : 'bg-gray-50'
                  }`}
                >
                  <p className={`text-xs uppercase ${tvMode ? 'text-slate-300' : 'text-gray-500'}`}>
                    Bloqueadas
                  </p>
                  <p className="text-2xl font-bold">{snapshot.bloqueadas.length}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs uppercase">
                  <span className={tvMode ? 'text-slate-400' : 'text-gray-500'}>Utilização</span>
                  <span className="font-semibold">{snapshot.utilizacao}%</span>
                </div>
                <div className={`mt-2 h-2 overflow-hidden rounded-full ${tvMode ? 'bg-white/10' : 'bg-gray-100'}`}>
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${palette.accent}`}
                    style={{ width: `${snapshot.utilizacao}%` }}
                  />
                </div>
              </div>

              <div
                className={`mt-4 rounded-2xl border p-4 ${
                  tvMode ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className={`text-xs uppercase ${tvMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    Operação em foco
                  </p>
                  {focusOp && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-blue-500">
                      <Activity size={14} />
                      {focusOp.status.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                {focusOp ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-lg font-semibold">
                      {formatOrderNumber(focusOp.ordem_numero)} · Prioridade {focusOp.prioridade}
                    </p>
                    <p className={tvMode ? 'text-slate-300 text-sm' : 'text-gray-600 text-sm'}>
                      {focusOp.produto_nome}
                    </p>
                    <p className="text-xs text-gray-500">
                      Previsto para {formatDateTime(focusOp.data_prevista_fim)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-gray-500">Sem operações em destaque.</div>
                )}
              </div>

              {snapshot.bloqueadas.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {snapshot.bloqueadas.slice(0, 3).map((op) => (
                    <span
                      key={op.id}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-600"
                    >
                      <AlertTriangle size={12} />
                      {formatOrderNumber(op.ordem_numero)}
                    </span>
                  ))}
                  {snapshot.bloqueadas.length > 3 && (
                    <span className="text-xs text-rose-500">
                      +{snapshot.bloqueadas.length - 3} bloqueios
                    </span>
                  )}
                </div>
              )}

              <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 text-sm ${tvMode ? 'text-slate-300' : 'text-gray-600'}`}>
                <div className="flex items-center gap-2">
                  <Clock size={16} />
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-70">Próxima entrega</p>
                    <p className="font-semibold text-base">{formatDateTime(snapshot.proximaEntrega)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span className="text-xs uppercase tracking-wide">
                    Último refresh {formatRelative(snapshot.ultimaAtualizacao)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {data.length === 0 && (
          <div
            className={`col-span-full rounded-3xl border p-8 text-center text-sm ${
              tvMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-gray-500'
            }`}
          >
            Nenhum centro de trabalho encontrado.
          </div>
        )}
      </div>
    </div>
  );
};

export default AndonGrid;
