import React, { useCallback, useState } from 'react';
import { User, ChevronDown, ChevronUp } from 'lucide-react';
import { cpfMask, isValidCPF } from '@/lib/masks';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';

type Props = {
  cpf: string;
  onCpfChange: (cpf: string) => void;
  clienteId: string | null;
  clienteNome: string | null;
  onClienteChange: (id: string | null, nome?: string) => void;
  disabled?: boolean;
};

export default function PdvCustomerBar({
  cpf,
  onCpfChange,
  clienteId,
  clienteNome,
  onClienteChange,
  disabled,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // Auto-expand when CPF/client is set
  const isActive = cpf.replace(/\D/g, '').length > 0 || !!clienteId;
  const isExpanded = expanded || isActive;

  const rawCpf = cpf.replace(/\D/g, '');
  const cpfValid = rawCpf.length === 11 && isValidCPF(cpf);
  const cpfInvalid = rawCpf.length === 11 && !isValidCPF(cpf);

  const handleCpfChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onCpfChange(cpfMask(e.target.value));
  }, [onCpfChange]);

  const handleClienteChange = useCallback((id: string | null, nome?: string) => {
    onClienteChange(id, nome);
  }, [onClienteChange]);

  return (
    <div className="border-b border-gray-200">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <User size={13} />
        <span className="font-medium">
          {isActive
            ? clienteNome || (cpfValid ? `CPF: ${cpf}` : 'Cliente / CPF')
            : 'Cliente / CPF na Nota'}
        </span>
        {isExpanded ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
        <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px] text-gray-500 font-mono">F4</kbd>
      </button>

      {/* Expandable bar */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* CPF field */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <label className="text-xs font-semibold text-gray-600 whitespace-nowrap">CPF na Nota</label>
            <input
              value={cpf}
              onChange={handleCpfChange}
              placeholder="___.___.___-__"
              disabled={disabled}
              maxLength={14}
              inputMode="numeric"
              className={`w-[160px] p-2 border rounded-lg text-sm focus:ring-2 focus:outline-none transition-colors ${
                cpfValid
                  ? 'border-emerald-400 focus:ring-emerald-300 bg-emerald-50/50'
                  : cpfInvalid
                    ? 'border-red-400 focus:ring-red-300 bg-red-50/50'
                    : 'border-gray-300 focus:ring-blue-500 bg-white'
              }`}
            />
            {cpfInvalid && <span className="text-[10px] text-red-500 font-medium">CPF inválido</span>}
          </div>

          {/* Divider */}
          <div className="hidden sm:block h-6 w-px bg-gray-200" />

          {/* Client autocomplete */}
          <div className="flex-grow min-w-[200px]">
            <ClientAutocomplete
              value={clienteId}
              onChange={handleClienteChange}
              placeholder="Buscar cliente (opcional)…"
              disabled={disabled}
              entity="client"
              allowCreate
              initialName={clienteNome || undefined}
              className="[&_input]:!p-2 [&_input]:!text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
