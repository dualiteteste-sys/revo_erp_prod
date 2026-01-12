"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { ptBR } from 'date-fns/locale';

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  label?: string;
  value: Date | null | undefined;
  onChange: (date: Date | null) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  triggerClassName?: string;
}

export default function DatePicker({
  label,
  value,
  onChange,
  className,
  placeholder = "Selecione uma data",
  disabled,
  required,
  triggerClassName,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [monthYearOpen, setMonthYearOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) setMonthYearOpen(false);
  }, [open]);

  const handleSelect = React.useCallback(
    (date?: Date) => {
      // DayPicker em modo "single" pode retornar `undefined` quando o usuário clica no dia já selecionado.
      // Como já temos um botão explícito de limpar, mantemos o comportamento previsível: undefined => null.
      onChange(date ?? null);
      if (date) setOpen(false);
    },
    [onChange]
  );

  return (
    <div className={cn(label ? "grid gap-2" : undefined, className)}>
        {label ? <label className="block text-sm font-medium text-gray-700">{label}</label> : null}
        <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button
            variant={"outline"}
            disabled={disabled}
            className={cn(
                "w-full justify-start text-left font-normal",
                !value && "text-muted-foreground",
                triggerClassName
            )}
            >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "PPP", { locale: ptBR }) : <span>{placeholder}</span>}
            </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "max-h-[calc(100vh-32px)] max-w-[92vw] overflow-hidden p-0 transition-[width,height] duration-200 ease-out",
            monthYearOpen ? "h-[520px] w-[520px]" : "h-[420px] w-[420px]"
          )}
        >
            <Calendar
            mode="single"
            required={required ?? true}
            selected={value || undefined}
            onSelect={handleSelect}
            initialFocus
            locale={ptBR}
            onMonthYearOpenChange={setMonthYearOpen}
            />
        </PopoverContent>
        </Popover>
    </div>
  )
}
