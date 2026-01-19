import React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FinanceiroRecorrenciaApplyScope } from '@/services/financeiroRecorrencias';

type Option = {
  value: FinanceiroRecorrenciaApplyScope;
  title: string;
  description: string;
};

const OPTIONS: Option[] = [
  {
    value: 'single',
    title: 'Somente esta conta',
    description: 'Ajusta apenas este lançamento (não altera a recorrência).',
  },
  {
    value: 'future',
    title: 'Esta e próximas (futuras)',
    description: 'Atualiza a recorrência e aplica em contas futuras ainda em aberto.',
  },
  {
    value: 'all_open',
    title: 'Todas em aberto',
    description: 'Atualiza a recorrência e aplica em todas as contas em aberto (da mesma recorrência).',
  },
];

export default function RecorrenciaApplyScopeDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: FinanceiroRecorrenciaApplyScope;
  onScopeChange: (scope: FinanceiroRecorrenciaApplyScope) => void;
  onConfirm: () => void;
  isLoading: boolean;
  title?: string;
  description?: string;
}) {
  const title = props.title ?? 'Aplicar alteração em conta recorrente';
  const description =
    props.description ??
    'Esta conta foi gerada por uma recorrência. Escolha o escopo para aplicar a alteração (estado da arte).';

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-3">
          {OPTIONS.map((opt) => {
            const checked = props.scope === opt.value;
            return (
              <label
                key={opt.value}
                className={[
                  'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition',
                  checked ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200 bg-white/60 hover:bg-white',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="recorrencia_apply_scope"
                  value={opt.value}
                  checked={checked}
                  onChange={() => props.onScopeChange(opt.value)}
                  className="mt-1 h-4 w-4 accent-blue-600"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{opt.title}</div>
                  <div className="text-xs text-gray-600">{opt.description}</div>
                </div>
              </label>
            );
          })}
        </div>

        <DialogFooter className="mt-6 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => props.onOpenChange(false)}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            disabled={props.isLoading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {props.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Aplicar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

