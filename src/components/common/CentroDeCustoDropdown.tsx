import React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { listAllCentrosDeCusto, type CentroDeCustoListItem, type TipoCentroCusto } from '@/services/centrosDeCusto';
import { useToast } from '@/contexts/ToastProvider';

type Props = {
  valueId?: string | null;
  valueName?: string | null;
  onChange: (id: string | null, name?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  includeEmpty?: boolean;
  allowedTipos?: TipoCentroCusto[] | null;
  className?: string;
};

function formatCentroLabel(cc: CentroDeCustoListItem) {
  const isRoot = (cc.nivel ?? 0) === 0;
  if (isRoot) return `- ${cc.nome}`.trim();
  const code = cc.codigo ? `${cc.codigo} ` : '';
  const indent = cc.nivel && cc.nivel > 0 ? `${'—'.repeat(Math.min(6, cc.nivel))} ` : '';
  return `${indent}${code}${cc.nome}`.trim();
}

function isNumericCode(code: string | null | undefined): boolean {
  const v = String(code ?? '').trim();
  if (!v) return false;
  return /^\d+(?:\.\d+)*$/.test(v);
}

function parseNumericCode(code: string): number[] {
  return code
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

function compareCentros(a: CentroDeCustoListItem, b: CentroDeCustoListItem, mode: 'numeric_asc' | 'alpha_asc'): number {
  if (mode === 'alpha_asc') {
    return String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR', { sensitivity: 'base' });
  }

  const ac = String(a.codigo ?? '').trim();
  const bc = String(b.codigo ?? '').trim();
  if (!ac && !bc) return String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR', { sensitivity: 'base' });
  if (!ac) return 1;
  if (!bc) return -1;

  const as = parseNumericCode(ac);
  const bs = parseNumericCode(bc);
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i += 1) {
    const av = as[i];
    const bv = bs[i];
    if (av === undefined && bv === undefined) break;
    // Regra: ordenação numérica asc (menor→maior). Se um código é prefixo do outro,
    // o mais raso vem primeiro (ex.: 3.01 antes de 3.01.06).
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av !== bv) return av - bv; // asc
  }

  // fallback estável
  return String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR', { sensitivity: 'base' });
}

export default function CentroDeCustoDropdown({
  valueId = null,
  valueName,
  onChange,
  disabled,
  placeholder = 'Selecionar…',
  includeEmpty = true,
  allowedTipos = null,
  className,
}: Props) {
  const { addToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<CentroDeCustoListItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const needsResolveSelected = !!valueId && !(valueName || '').trim();
    const shouldFetch = open || needsResolveSelected;
    if (!shouldFetch) return;
    if (items.length > 0) return;
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
  }, [addToast, items.length, open, valueId, valueName]);

  const filteredSorted = React.useMemo(() => {
    const filtered = allowedTipos?.length ? items.filter((cc) => allowedTipos.includes(cc.tipo)) : items;
    const hasAnyCode = filtered.some((cc) => String(cc.codigo ?? '').trim().length > 0);
    const shouldNumeric = hasAnyCode && filtered.every((cc) => !String(cc.codigo ?? '').trim() || isNumericCode(cc.codigo));
    const mode: 'numeric_asc' | 'alpha_asc' = shouldNumeric ? 'numeric_asc' : 'alpha_asc';

    const byTipo = new Map<TipoCentroCusto, CentroDeCustoListItem[]>();
    for (const cc of filtered) {
      const arr = byTipo.get(cc.tipo) ?? [];
      arr.push(cc);
      byTipo.set(cc.tipo, arr);
    }

    const tiposInScope = (allowedTipos?.length ? allowedTipos : Array.from(byTipo.keys())).filter((t) => byTipo.has(t));

    const groupEntries = tiposInScope
      .map((tipo) => {
        const group = byTipo.get(tipo) ?? [];
        const roots = group.filter((cc) => (cc.nivel ?? 0) === 0).sort((a, b) => compareCentros(a, b, mode));
        const children = group.filter((cc) => (cc.nivel ?? 0) > 0).sort((a, b) => compareCentros(a, b, mode));
        const rootCode = String(roots[0]?.codigo ?? '').trim();
        return { tipo, roots, children, rootCode };
      })
      .filter((g) => g.roots.length > 0 || g.children.length > 0);

    // Ordena grupos (Receitas/Despesas) por código raiz quando numérico; fallback por nome do tipo.
    groupEntries.sort((a, b) => {
      if (mode === 'numeric_asc' && isNumericCode(a.rootCode) && isNumericCode(b.rootCode)) {
        const as = parseNumericCode(a.rootCode);
        const bs = parseNumericCode(b.rootCode);
        const n = Math.max(as.length, bs.length);
        for (let i = 0; i < n; i += 1) {
          const av = as[i];
          const bv = bs[i];
          if (av === undefined && bv === undefined) break;
          if (av === undefined) return -1;
          if (bv === undefined) return 1;
          if (av !== bv) return av - bv;
        }
        return 0;
      }
      return String(a.tipo).localeCompare(String(b.tipo), 'pt-BR', { sensitivity: 'base' });
    });

    return groupEntries.flatMap((g) => [...g.roots, ...g.children]);
  }, [allowedTipos, items]);

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

                {filteredSorted.map((cc) => {
                  const isSelected = !!selectedId && cc.id === selectedId;
                  const label = formatCentroLabel(cc);
                  const isRoot = (cc.nivel ?? 0) === 0;
                  return (
                    <CommandItem
                      key={cc.id}
                      value={label}
                      onSelect={
                        isRoot
                          ? undefined
                          : () => {
                              onChange(cc.id, cc.nome);
                              setOpen(false);
                            }
                      }
                      disabled={isRoot}
                      className={cn(
                        'flex items-start gap-2 py-2',
                        isRoot && 'cursor-default opacity-70',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border text-xs',
                          isSelected ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-transparent',
                        )}
                        aria-hidden
                      >
                        {!isRoot && isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span className={cn('truncate text-sm font-medium text-gray-800', isRoot && 'font-semibold text-gray-700')}>{label}</span>
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
