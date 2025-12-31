import React from 'react';
import { Button } from '@/components/ui/button';

type Action = {
  key: string;
  label: string;
  onClick: () => void | Promise<void>;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost' | 'link';
  disabled?: boolean;
};

export default function BulkActionsBar(props: {
  selectedCount: number;
  onClear: () => void;
  actions: Action[];
}) {
  if (props.selectedCount <= 0) return null;

  return (
    <div className="sticky top-0 z-10 mb-3 rounded-xl border border-slate-200 bg-white/90 backdrop-blur px-3 py-2 flex items-center justify-between gap-3">
      <div className="text-sm text-slate-700">
        <span className="font-semibold">{props.selectedCount}</span> selecionado(s)
      </div>
      <div className="flex items-center gap-2">
        {props.actions.map((a) => (
          <Button key={a.key} variant={a.variant ?? 'secondary'} onClick={a.onClick} disabled={a.disabled}>
            {a.label}
          </Button>
        ))}
        <Button variant="ghost" onClick={props.onClear}>
          Limpar
        </Button>
      </div>
    </div>
  );
}

