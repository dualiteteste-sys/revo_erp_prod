import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type TotalLine = {
  key: string;
  label: string;
  value: number | null;
};

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatBRL(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return brlFormatter.format(Number(value));
}

export default function SelectionTotalizerBar(props: {
  mode: 'explicit' | 'all_matching';
  selectedCount: number;
  totalMatchingCount: number;
  totals: TotalLine[];
  loading?: boolean;
  onSelectAllMatching?: () => void;
  onClear: () => void;
}) {
  if (props.selectedCount <= 0) return null;

  const canSelectAllMatching =
    props.mode === 'explicit' &&
    props.selectedCount > 0 &&
    props.selectedCount < props.totalMatchingCount &&
    !!props.onSelectAllMatching;

  const selectionLabel = (() => {
    if (props.mode !== 'all_matching') return `${props.selectedCount} selecionado(s)`;
    if (props.selectedCount >= props.totalMatchingCount) {
      return `Todos os ${props.totalMatchingCount} resultados selecionados`;
    }
    return `${props.selectedCount} selecionado(s) de ${props.totalMatchingCount}`;
  })();

  return (
    <div className="sticky top-0 z-20 mb-3 rounded-xl border border-slate-200 bg-white/90 backdrop-blur px-3 py-2 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-slate-700 whitespace-nowrap">
        <span className="font-semibold">{selectionLabel}</span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 min-w-0">
        {props.loading ? (
          <span className="inline-flex items-center gap-2 text-xs text-slate-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Calculando totais...
          </span>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 min-w-0">
          {props.totals.map((t) => (
            <div key={t.key} className="text-xs text-slate-600 whitespace-nowrap">
              <span className="font-medium text-slate-700">{t.label}:</span> {formatBRL(t.value)}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {canSelectAllMatching ? (
            <Button variant="secondary" onClick={props.onSelectAllMatching}>
              Selecionar todos os {props.totalMatchingCount}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={props.onClear}>
            Limpar
          </Button>
        </div>
      </div>
    </div>
  );
}
