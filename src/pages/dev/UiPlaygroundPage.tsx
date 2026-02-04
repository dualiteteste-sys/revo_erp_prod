"use client"

import { useState } from "react"

import PageShell from "@/components/ui/PageShell"
import PageHeader from "@/components/ui/PageHeader"
import GlassCard from "@/components/ui/GlassCard"
import DatePicker from "@/components/ui/DatePicker"
import Input from "@/components/ui/forms/Input"

export default function UiPlaygroundPage() {
  const [date1, setDate1] = useState<Date | null>(new Date())
  const [date2, setDate2] = useState<Date | null>(null)
  const [nativeValue, setNativeValue] = useState<string>("")

  return (
    <PageShell
      header={
        <PageHeader
          title="UI Playground"
          description="Componentes isolados para validação rápida (DEV)"
        />
      }
    >

      <div className="grid gap-6 md:grid-cols-2">
        <GlassCard className="p-6">
          <div className="text-sm font-semibold text-gray-800">DatePicker (novo estilo)</div>
          <div className="mt-4 grid gap-4">
            <DatePicker label="Exemplo 1" value={date1} onChange={setDate1} />
            <DatePicker label="Exemplo 2" value={date2} onChange={setDate2} />
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <div className="text-sm font-semibold text-gray-800">Input type=&quot;date&quot; (padronizado)</div>
          <div className="mt-4 grid gap-4">
            <Input
              label="Data (Input)"
              name="playground_date"
              type="date"
              value={nativeValue}
              onChange={(e) => setNativeValue(e.target.value)}
              placeholder="Selecione uma data"
            />
            <div className="text-xs text-gray-500">Valor atual: {nativeValue || "(vazio)"}</div>
          </div>
        </GlassCard>
      </div>
    </PageShell>
  )
}
