import React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FinanceiroRecorrenciaApplyScope } from '@/services/financeiroRecorrencias';

export type RecorrenciaApplyScopeDialogTipo = 'recorrencia' | 'parcelamento' | 'standalone';

type OptionDef = {
  value: FinanceiroRecorrenciaApplyScope;
  title: string;
  description: string;
};

function buildOptions(tipo: RecorrenciaApplyScopeDialogTipo): OptionDef[] {
  if (tipo === 'recorrencia') {
    return [
      {
        value: 'single',
        title: 'Somente esta conta',
        description: 'Salva apenas este lançamento, sem afetar os demais.',
      },
      {
        value: 'future',
        title: 'Esta e as próximas',
        description: 'Aplica a alteração nesta e nas contas futuras ainda em aberto desta recorrência.',
      },
      {
        value: 'all_open',
        title: 'Todas em aberto',
        description: 'Aplica a alteração em todas as contas em aberto desta recorrência.',
      },
    ];
  }

  if (tipo === 'parcelamento') {
    return [
      {
        value: 'single',
        title: 'Somente esta parcela',
        description: 'Salva apenas esta parcela, sem afetar as demais.',
      },
      {
        value: 'all_open',
        title: 'Todas as parcelas em aberto',
        description: 'Aplica a alteração em todas as parcelas deste parcelamento que ainda estão em aberto.',
      },
    ];
  }

  // standalone: apenas confirmação da própria conta
  return [
    {
      value: 'single',
      title: 'Somente esta conta',
      description: 'Salva apenas este lançamento.',
    },
  ];
}

export default function RecorrenciaApplyScopeDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: FinanceiroRecorrenciaApplyScope;
  onScopeChange: (scope: FinanceiroRecorrenciaApplyScope) => void;
  onConfirm: () => void;
  isLoading: boolean;
  tipo?: RecorrenciaApplyScopeDialogTipo;
  title?: string;
  description?: string;
}) {
  const tipo = props.tipo ?? 'standalone';
  const options = buildOptions(tipo);

  const title =
    props.title ??
    (tipo === 'recorrencia'
      ? 'Aplicar alteração em conta recorrente'
      : tipo === 'parcelamento'
        ? 'Salvar alteração em conta parcelada'
        : 'Salvar alteração');

  const description =
    props.description ??
    (tipo === 'recorrencia'
      ? 'Esta conta faz parte de uma recorrência. Escolha o escopo para aplicar a alteração.'
      : tipo === 'parcelamento'
        ? 'Esta conta faz parte de um parcelamento. Escolha o escopo para aplicar a alteração.'
        : 'Escolha como deseja salvar a alteração nesta conta.');

  // Garantir que o scope seja válido para o tipo atual
  const validScopes = options.map((o) => o.value);
  const effectiveScope = validScopes.includes(props.scope) ? props.scope : options[0].value;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-3">
          {options.map((opt) => {
            const checked = effectiveScope === opt.value;
            return (
              <label
                key={opt.value}
                className={[
                  'flex items-start gap-3 rounded-xl border px-4 py-3 transition cursor-pointer',
                  checked
                    ? 'border-blue-400 bg-blue-50/60'
                    : 'border-gray-200 bg-white/60 hover:bg-white',
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
