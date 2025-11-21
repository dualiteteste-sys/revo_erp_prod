import React from 'react';
import type { LogsFilters as LogsFiltersType } from './types';
import { Button } from '@/components/ui/button';
import DatePicker from '@/components/ui/DatePicker';
import Select from '@/components/ui/forms/Select';
import MultiSelect from '@/components/ui/MultiSelect';
import Input from '@/components/ui/forms/Input';
import { Loader2 } from 'lucide-react';

type Props = {
  value: LogsFiltersType;
  onChange: (patch: Partial<LogsFiltersType>) => void;
  onSubmit: () => void;
  onClear: () => void;
  tableOptions: { value: string; label: string }[];
  isLoading: boolean;
};

const SOURCE_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'postgrest', label: 'API' },
  { value: 'trigger', label: 'Gatilho (DB)' },
  { value: 'func', label: 'Função (RPC)' },
];

const OP_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'INSERT', label: 'Criação' },
  { value: 'UPDATE', label: 'Atualização' },
  { value: 'DELETE', label: 'Exclusão' },
  { value: 'SELECT', label: 'Leitura' },
];

export function LogsFilters({ value, onChange, onSubmit, onClear, tableOptions, isLoading }: Props) {
  const handleSingleSelectChange = (field: 'source' | 'op', selectedValue: string) => {
    onChange({ [field]: selectedValue === 'ALL' ? ['ALL'] : [selectedValue] });
  };

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 border bg-gray-50/50 rounded-xl mb-6">
      <DatePicker
        label="Data de Início"
        value={value.from}
        onChange={(date) => onChange({ from: date })}
        className="flex-grow min-w-[200px]"
      />
      <DatePicker
        label="Data de Fim"
        value={value.to}
        onChange={(date) => onChange({ to: date })}
        className="flex-grow min-w-[200px]"
      />
      <Select
        label="Origem"
        value={value.source?.[0] || 'ALL'}
        onChange={(e) => handleSingleSelectChange('source', e.target.value)}
        className="flex-grow min-w-[180px]"
      >
        {SOURCE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </Select>
      <Select
        label="Operação"
        value={value.op?.[0] || 'ALL'}
        onChange={(e) => handleSingleSelectChange('op', e.target.value as any)}
        className="flex-grow min-w-[180px]"
      >
        {OP_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </Select>
      <MultiSelect
        label="Tabelas"
        options={tableOptions}
        selected={value.table || []}
        onChange={(tables) => onChange({ table: tables })}
        placeholder="Selecionar tabelas"
        className="flex-grow min-w-[220px]"
      />
      <Input
        label="Busca"
        value={value.q || ''}
        onChange={(e) => onChange({ q: e.target.value })}
        placeholder="PK, diff, meta..."
        className="flex-grow min-w-[200px]"
      />
      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Filtrar
        </Button>
        <Button variant="outline" onClick={onClear} disabled={isLoading}>
          Limpar
        </Button>
      </div>
    </div>
  );
}

export default LogsFilters;
