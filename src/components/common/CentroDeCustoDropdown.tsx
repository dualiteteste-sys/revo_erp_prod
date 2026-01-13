import React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { listAllCentrosDeCusto, type CentroDeCustoListItem } from '@/services/centrosDeCusto';
import { useToast } from '@/contexts/ToastProvider';

type Props = {
  valueId?: string | null;
  valueName?: string | null;
  onChange: (id: string | null, name?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  includeEmpty?: boolean;
  className?: string;
};

function formatCentroLabel(cc: CentroDeCustoListItem) {
  const code = cc.codigo ? `${cc.codigo} ` : '';
  const indent = cc.nivel && cc.nivel > 0 ? `${'—'.repeat(Math.min(6, cc.nivel))} ` : '';
  return `${indent}${code}${cc.nome}`.trim();
}

export default function CentroDeCustoDropdown({
  valueId = null,
  valueName,
  onChange,
  disabled,
  placeholder = 'Selecionar…',
  includeEmpty = true,
  className,
}: Props) {
  const { addToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<CentroDeCustoListItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || disabled) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const all = await listAllCentrosDeCusto({ status: 'ativo' });
        if (cancelled) return;
        setItems(all);
      } catch (e: any) {
        if (!cancelled) addToast(e?.message || 'Erro ao listar centros de custo.', 'error');
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [addToast, disabled, open]);

  const selectedId = React.useMemo(() => {
    if (valueId) return valueId;
    const name = (valueName || '').trim().toLowerCase();
    if (!name) return '';
    const found = items.find((cc) => (cc.nome || '').trim().toLowerCase() === name);
    return found?.id || '';
  }, [items, valueId, valueName]);

  const selected = React.useMemo(() => items.find((cc) => cc.id === selectedId), [items, selectedId]);
  const triggerLabel = selected ? formatCentroLabel(selected) : valueName || placeholder;

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full justify-between', !selectedId && !valueName && 'text-muted-foreground')}
            disabled={disabled}
          >
            <span className="truncate">{triggerLabel}</span>
            <span className="ml-2 flex items-center gap-1">
              {includeEmpty && (selectedId || valueName) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(null);
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-700"
                  aria-label="Limpar centro de custo"
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
          <Command shouldFilter={false}>
            <CommandList className="max-h-[320px] overflow-y-auto">
              <CommandEmpty>{loading ? 'Carregando…' : 'Nenhum centro de custo encontrado'}</CommandEmpty>
              <CommandGroup>
                {includeEmpty ? (
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 py-2"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent" />
                    <span className="text-sm text-gray-700">{placeholder}</span>
                  </CommandItem>
                ) : null}

                {items.map((cc) => {
                  const isSelected = !!selectedId && cc.id === selectedId;
                  const label = formatCentroLabel(cc);
                  return (
                    <CommandItem
                      key={cc.id}
                      value={label}
                      onSelect={() => {
                        onChange(cc.id, cc.nome);
                        setOpen(false);
                      }}
                      className="flex items-start gap-2 py-2"
                    >
                      <span
                        className={cn(
                          'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border text-xs',
                          isSelected ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-transparent',
                        )}
                        aria-hidden
                      >
                        {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-800">{label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
