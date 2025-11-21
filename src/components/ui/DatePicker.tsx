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
    label: string;
    value: Date | null | undefined;
    onChange: (date: Date | undefined) => void;
    className?: string;
}

export default function DatePicker({ label, value, onChange, className }: DatePickerProps) {
  return (
    <div className={cn("grid gap-2", className)}>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <Popover>
        <PopoverTrigger asChild>
            <Button
            variant={"outline"}
            className={cn(
                "w-full justify-start text-left font-normal",
                !value && "text-muted-foreground"
            )}
            >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
            </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
            <Calendar
            mode="single"
            selected={value || undefined}
            onSelect={onChange}
            initialFocus
            locale={ptBR}
            />
        </PopoverContent>
        </Popover>
    </div>
  )
}
