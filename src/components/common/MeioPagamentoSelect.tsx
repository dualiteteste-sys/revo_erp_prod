import * as React from 'react';
import { ChevronsUpDown, X, Check, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { searchMeiosPagamento, upsertMeioPagamento, type MeioPagamento, type MeioPagamentoTipo } from '@/services/meiosPagamento';
import { useToast } from '@/contexts/ToastProvider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type Props = {
  tipo: MeioPagamentoTipo;
  value: string | null;
  initialName?: string;
  onChange: (name: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
  allowCreate?: boolean;
  className?: string;
};

export default function MeioPagamentoSelect({
  tipo,
  value,
  initialName,
  onChange,
  disabled,
  placeholder = 'Selecionar…',
  allowClear = true,
  allowCreate = true,
  className,
}: Props) {
  const { addToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [items, setItems] = React.useState<MeioPagamento[]>([]);

  const debounced = useDebounce(query, 250);

  React.useEffect(() => {
    if (!open) return;
    if (!query && (value || initialName)) setQuery(value || initialName || '');
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
        const rows = await searchMeiosPagamento({ tipo, q, limit: 20 });
        if (cancelled) return;
        setItems(rows);
      } catch (e: any) {
        addToast(e?.message || 'Erro ao buscar meios.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [addToast, debounced, disabled, open, tipo]);

  const selectedLabel = value || initialName || '';
  const triggerLabel = selectedLabel || placeholder;

  const normalizedQuery = query.trim();
  const hasExact = normalizedQuery
    ? items.some((m) => m.nome.trim().toLowerCase() === normalizedQuery.toLowerCase())
    : false;

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full justify-between', !selectedLabel && 'text-muted-foreground')}
            disabled={disabled}
          >
            <span className="truncate">{triggerLabel}</span>
            <span className="ml-2 flex items-center gap-1">
              {allowClear && selectedLabel ? (
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
            <CommandInput
              placeholder={tipo === 'pagamento' ? 'Buscar forma de pagamento…' : 'Buscar forma de recebimento…'}
              value={query}
              onValueChange={(v) => setQuery(v)}
            />
            <CommandList>
              <CommandEmpty>
                {creating ? 'Criando…' : loading ? 'Buscando…' : 'Nenhum resultado'}
              </CommandEmpty>
              <CommandGroup>
                {allowCreate && normalizedQuery.length >= 2 && !hasExact ? (
                  <CommandItem
                    value={`__create__${normalizedQuery}`}
                    onSelect={async () => {
                      if (creating) return;
                      setCreating(true);
                      try {
                        const created = await upsertMeioPagamento({ tipo, nome: normalizedQuery, ativo: true });
                        onChange(created.nome);
                        setQuery(created.nome);
                        setOpen(false);
                        addToast('Meio criado e selecionado.', 'success');
                      } catch (e: any) {
                        addToast(e?.message || 'Erro ao criar meio.', 'error');
                      } finally {
                        setCreating(false);
                      }
                    }}
                    className="flex items-center gap-2 py-2"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-blue-200 bg-blue-50 text-blue-700">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm">Criar “{normalizedQuery}”</span>
                  </CommandItem>
                ) : null}

                {items.map((m) => {
                  const isSelected = !!selectedLabel && m.nome === selectedLabel;
                  return (
                    <CommandItem
                      key={m.id}
                      value={m.nome}
                      onSelect={() => {
                        onChange(m.nome);
                        setQuery(m.nome);
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

