import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { menuConfig } from '@/config/menuConfig';
import { PlusCircle } from 'lucide-react';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { filterMenuByFeatures } from '@/utils/menu/filterMenuByFeatures';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

type PaletteItem = {
  id: string;
  group: string;
  label: string;
  href: string;
  Icon?: React.ElementType;
};

type RecentEntry = Pick<PaletteItem, 'id' | 'group' | 'label' | 'href'>;

const STORAGE_KEY = 'ui:commandPaletteRecents';
const MAX_RECENTS = 8;

function flattenMenu(menu = menuConfig): PaletteItem[] {
  const items: PaletteItem[] = [];

  for (const group of menu) {
    if (group.children?.length) {
      for (const child of group.children) {
        if (!child.href || child.href === '#') continue;
        items.push({
          id: `${group.name}:${child.name}`,
          group: group.name,
          label: child.name,
          href: child.href,
          Icon: child.icon,
        });
      }
      continue;
    }

    if (!group.href || group.href === '#') continue;
    items.push({
      id: group.name,
      group: 'Geral',
      label: group.name,
      href: group.href,
      Icon: group.icon,
    });
  }

  return items;
}

function getActionItems({ industriaEnabled }: { industriaEnabled: boolean }): PaletteItem[] {
  if (!industriaEnabled) return [];
  return [
    { id: 'action:new-op', group: 'Ações', label: 'Nova Ordem (Industrialização)', href: '/app/industria/ordens?tipo=industrializacao&new=1', Icon: PlusCircle },
    { id: 'action:new-ob', group: 'Ações', label: 'Nova Ordem (Beneficiamento)', href: '/app/industria/ordens?tipo=beneficiamento&new=1', Icon: PlusCircle },
    { id: 'action:new-bom', group: 'Ações', label: 'Nova Ficha Técnica / BOM', href: '/app/industria/boms?new=1', Icon: PlusCircle },
    { id: 'action:new-roteiro', group: 'Ações', label: 'Novo Roteiro', href: '/app/industria/roteiros?new=1', Icon: PlusCircle },
    { id: 'action:new-ct', group: 'Ações', label: 'Novo Centro de Trabalho', href: '/app/industria/centros-trabalho?new=1', Icon: PlusCircle },
  ];
}

function readRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function writeRecents(next: RecentEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_RECENTS)));
  } catch {
    // ignore
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<RecentEntry[]>(() => readRecents());
  const { industria_enabled, servicos_enabled, loading } = useEmpresaFeatures();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredMenu = useMemo(() => {
    // Estado da arte: não exibir módulos condicionais enquanto as features não carregaram.
    return filterMenuByFeatures(menuConfig, {
      industria_enabled: loading ? false : industria_enabled,
      servicos_enabled: loading ? false : servicos_enabled,
    });
  }, [industria_enabled, servicos_enabled, loading]);

  const allItems = useMemo(
    () => [...getActionItems({ industriaEnabled: industria_enabled }), ...flattenMenu(filteredMenu)],
    [filteredMenu, industria_enabled]
  );

  const groupedItems = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of allItems) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allItems]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Alguns eventos podem chegar sem `key` (ou com value inesperado) dependendo do browser/extensões.
      const key = typeof e.key === 'string' ? e.key : '';
      const isK = key.toLowerCase() === 'k';
      const isMeta = e.metaKey || e.ctrlKey;
      if (!isK || !isMeta) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setRecents(readRecents());
      // Garante foco no input (UX-01)
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Se a rota mudou por qualquer motivo, fecha o palette (evita sobreposição)
  useEffect(() => {
    if (open) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleSelect = (item: PaletteItem | RecentEntry) => {
    if (!item.href || item.href === '#') return;
    if (item.href !== location.pathname) navigate(item.href);
    const next: RecentEntry[] = [
      { id: item.id, group: item.group, label: item.label, href: item.href },
      ...recents.filter((r) => r.href !== item.href),
    ].slice(0, MAX_RECENTS);
    setRecents(next);
    writeRecents(next);
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        // @ts-expect-error ref typing from cmdk
        ref={inputRef as any}
        placeholder="Buscar páginas… (Ctrl/Cmd + K)"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nenhum resultado.</CommandEmpty>

        {recents.length > 0 && (
          <>
            <CommandGroup heading="Recentes">
              {recents.map((item) => (
                <CommandItem key={item.href} onSelect={() => handleSelect(item)} value={`${item.group} ${item.label}`}>
                  <span className="text-sm">{item.label}</span>
                  <span className="ml-auto text-xs text-gray-500">{item.group}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {groupedItems.map(([groupName, items]) => (
          <CommandGroup key={groupName} heading={groupName}>
            {items.map((item) => {
              const Icon = item.Icon;
              return (
                <CommandItem
                  key={item.href}
                  onSelect={() => handleSelect(item)}
                  value={`${groupName} ${item.label}`}
                >
                  {Icon ? <Icon className="mr-2 h-4 w-4 text-gray-500" /> : null}
                  <span className="text-sm">{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
