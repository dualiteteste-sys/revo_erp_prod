import * as React from 'react';
import { ChevronsUpDown, X, Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { searchCentrosDeCusto, type CentroDeCustoListItem } from '@/services/centrosDeCusto';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type Props = {
  value: string | null;
  initialName?: string;
  onChange: (id: string | null, name?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  allowClear?: boolean;
  className?: string;
};

export default function CentroDeCustoSelect({
  value,
  initialName,
  onChange,
  disabled,
  placeholder = 'Selecionar…',
  searchPlaceholder = 'Buscar centro de custo…',
  emptyLabel = 'Nenhum centro de custo encontrado',
  allowClear = true,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<CentroDeCustoListItem[]>([]);

  const debounced = useDebounce(query, 300);

  React.useEffect(() => {
    if (!open) return;
    if (value && initialName && query.trim() === '') setQuery(initialName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!open || disabled) return;
      const q = debounced.trim();
      if (q.length < 2) {
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const rows = await searchCentrosDeCusto(q);
        if (cancelled) return;
        setItems(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [debounced, disabled, open]);

  const selectedLabel = initialName || (value ? query : '');
  const triggerLabel = value ? selectedLabel || placeholder : placeholder;

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full justify-between', !value && 'text-muted-foreground')}
            disabled={disabled}
          >
            <span className="truncate">{triggerLabel}</span>
            <span className="ml-2 flex items-center gap-1">
              {allowClear && (value || query) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(null);
                    setQuery('');
                    setItems([]);
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
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={(v) => setQuery(v)}
            />
            <CommandList>
              <CommandEmpty>{loading ? 'Buscando…' : emptyLabel}</CommandEmpty>
              <CommandGroup>
                {items.map((cc) => {
                  const code = cc.codigo ? `${cc.codigo} ` : '';
                  const label = `${code}${cc.nome}`;
                  const isSelected = !!value && cc.id === value;
                  return (
                    <CommandItem
                      key={cc.id}
                      value={label}
                      onSelect={() => {
                        onChange(cc.id, cc.nome);
                        setQuery(cc.nome);
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
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-800">{label}</div>
                        <div className="truncate text-xs text-gray-500">{cc.tipo}</div>
                      </div>
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

