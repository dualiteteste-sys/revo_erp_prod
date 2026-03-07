import React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FinanceiroRecorrenciaApplyScope } from '@/services/financeiroRecorrencias';

type Option = {
  value: FinanceiroRecorrenciaApplyScope;
  title: string;
  description: string;
  onlyRecorrente?: boolean;
};

const OPTIONS: Option[] = [
  {
    value: 'single',
    title: 'Somente esta conta',
    description: 'Salva apenas este lançamento.',
  },
  {
    value: 'future',
    title: 'Esta e próximas (futuras)',
    description: 'Atualiza a recorrência e aplica em contas futuras ainda em aberto.',
    onlyRecorrente: true,
  },
  {
    value: 'all_open',
    title: 'Todas em aberto',
    description: 'Atualiza a recorrência e aplica em todas as contas em aberto (da mesma recorrência).',
    onlyRecorrente: true,
  },
];

export default function RecorrenciaApplyScopeDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: FinanceiroRecorrenciaApplyScope;
  onScopeChange: (scope: FinanceiroRecorrenciaApplyScope) => void;
  onConfirm: () => void;
  isLoading: boolean;
  isRecorrente?: boolean;
  title?: string;
  description?: string;
}) {
  const isRecorrente = props.isRecorrente ?? false;
  const title =
    props.title ??
    (isRecorrente ? 'Aplicar alteração em conta recorrente' : 'Salvar alteração');
  const description =
    props.description ??
    (isRecorrente
      ? 'Esta conta faz parte de uma recorrência. Escolha o escopo para aplicar a alteração.'
      : 'Escolha como deseja salvar a alteração nesta conta.');

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-3">
          {OPTIONS.map((opt) => {
            const disabled = !isRecorrente && !!opt.onlyRecorrente;
            const checked = props.scope === opt.value;
            return (
              <label
                key={opt.value}
                className={[
                  'flex items-start gap-3 rounded-xl border px-4 py-3 transition',
                  disabled
                    ? 'cursor-not-allowed opacity-40 border-gray-100 bg-gray-50'
                    : checked
                      ? 'cursor-pointer border-blue-400 bg-blue-50/60'
                      : 'cursor-pointer border-gray-200 bg-white/60 hover:bg-white',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="recorrencia_apply_scope"
                  value={opt.value}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => !disabled && props.onScopeChange(opt.value)}
                  className="mt-1 h-4 w-4 accent-blue-600"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{opt.title}</div>
                  <div className="text-xs text-gray-600">
                    {disabled ? 'Disponível apenas para contas recorrentes.' : opt.description}
                  </div>
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
