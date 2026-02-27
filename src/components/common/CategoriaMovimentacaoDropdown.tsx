import React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { listCategoriasMovimentacao, type CategoriaMovimentacao } from '@/services/categoriasMovimentacao';
import { useToast } from '@/contexts/ToastProvider';

type Props = {
  value?: string | null;
  onChange: (nome: string | null) => void;
  tipo?: 'entrada' | 'saida';
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export default function CategoriaMovimentacaoDropdown({
  value = null,
  onChange,
  tipo,
  disabled,
  placeholder = 'Selecionar categoria…',
  className,
}: Props) {
  const { addToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<CategoriaMovimentacao[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (items.length > 0) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const data = await listCategoriasMovimentacao({ tipo: tipo ?? null, ativo: true });
        if (cancelled) return;
        setItems(data);
      } catch (e: any) {
        if (!cancelled) addToast(e?.message || 'Erro ao listar categorias.', 'error');
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [addToast, items.length, open, tipo]);

  // Reload when tipo changes (entrada ↔ saida)
  React.useEffect(() => {
    setItems([]);
  }, [tipo]);

  const selected = items.find((c) => c.nome === value);
  const triggerLabel = value || placeholder;

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
              {value ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(null);
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-700"
                  aria-label="Limpar categoria"
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
            <CommandList className="max-h-[280px] overflow-y-auto">
              <CommandEmpty>{loading ? 'Carregando…' : 'Nenhuma categoria encontrada'}</CommandEmpty>
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
                  <span className="text-sm text-gray-500">{placeholder}</span>
                </CommandItem>

                {items.map((cat) => {
                  const isSelected = cat.nome === value;
                  return (
                    <CommandItem
                      key={cat.id}
                      value={cat.nome}
                      onSelect={() => {
                        onChange(cat.nome);
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
                      <span className="truncate text-sm font-medium text-gray-800">{cat.nome}</span>
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
