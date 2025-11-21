import * as React from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";

type Option = { label: string; value: string };

type MultiSelectProps = {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
};

export default function MultiSelect({
  options,
  selected: value,
  onChange,
  label,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar…",
  emptyLabel = "Nenhum item",
  className,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(
    () => new Set(value ?? []),
    [value]
  );

  function toggle(val: string) {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(Array.from(next));
  }

  const triggerLabel =
    value?.length
      ? options
          .filter(o => selected.has(o.value))
          .map(o => o.label)
          .join(", ")
      : placeholder;

  return (
    <div className={className}>
        {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
        <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button
            type="button"
            variant="outline"
            className={cn("w-full justify-between", !value?.length && "text-muted-foreground")}
            disabled={disabled}
            >
            <span className="truncate">
                {triggerLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
        </PopoverTrigger>

        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
            <Command shouldFilter>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList role="listbox" aria-multiselectable="true">
                <CommandEmpty>{emptyLabel}</CommandEmpty>
                <CommandGroup>
                {options.map((opt) => {
                    const isSelected = selected.has(opt.value);
                    return (
                    <CommandItem
                        key={opt.value}
                        value={opt.label}
                        onSelect={() => {}}
                        className="px-2 py-1.5"
                        role="option"
                        aria-selected={isSelected}
                        asChild
                    >
                        <label className="flex items-center gap-2 cursor-pointer w-full">
                        <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={isSelected}
                            onChange={() => toggle(opt.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                        <span
                            aria-hidden
                            className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center",
                            isSelected ? "bg-primary text-primary-foreground" : ""
                            )}
                        >
                            {isSelected ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="text-sm">{opt.label}</span>
                        </label>
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
