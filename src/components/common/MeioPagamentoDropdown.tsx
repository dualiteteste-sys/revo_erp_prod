import React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { searchMeiosPagamento, type MeioPagamentoTipo } from '@/services/meiosPagamento';
import { useToast } from '@/contexts/ToastProvider';

type Props = {
  tipo: MeioPagamentoTipo;
  value: string | null;
  onChange: (name: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export default function MeioPagamentoDropdown({
  tipo,
  value,
  onChange,
  disabled,
  placeholder = 'Selecionar…',
  className,
}: Props) {
  const { addToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Array<{ id: string; nome: string }>>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || disabled) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const data = await searchMeiosPagamento({ tipo, q: null, limit: 200 });
        if (!cancelled) setItems(data);
      } catch (e: any) {
        if (!cancelled) addToast(e?.message || 'Erro ao listar meios.', 'error');
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [addToast, disabled, open, tipo]);

  const normalized = (value || '').trim();
  const hasValueInList = normalized
    ? items.some((m) => (m.nome || '').trim().toLowerCase() === normalized.toLowerCase())
    : true;

  const triggerLabel = normalized || placeholder;

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full justify-between', !normalized && 'text-muted-foreground')}
            disabled={disabled}
          >
            <span className="truncate">{triggerLabel}</span>
            <span className="ml-2 flex items-center gap-1">
              {normalized ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(null);
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-700"
                  aria-label="Limpar"
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
              <CommandEmpty>{loading ? 'Carregando…' : 'Nenhum resultado'}</CommandEmpty>
              <CommandGroup>
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

                {!hasValueInList && normalized ? (
                  <CommandItem
                    value={`__legacy__${normalized}`}
                    onSelect={() => {
                      onChange(normalized);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 py-2"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent" />
                    <span className="text-sm text-gray-700">{`${normalized} (não cadastrado/ inativo)`}</span>
                  </CommandItem>
                ) : null}

                {items.map((m) => {
                  const isSelected = normalized && m.nome.trim().toLowerCase() === normalized.toLowerCase();
                  return (
                    <CommandItem
                      key={m.id}
                      value={m.nome}
                      onSelect={() => {
                        onChange(m.nome);
                        setOpen(false);
                      }}
                      className="flex items-center gap-2 py-2"
                    >
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded border text-xs',
                          isSelected ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-transparent',
                        )}
                        aria-hidden
                      >
                        {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-800">{m.nome}</span>
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
