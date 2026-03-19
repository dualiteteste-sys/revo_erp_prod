import React from 'react';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  rascunho: { label: 'Pré-NF-e', className: 'bg-indigo-100 text-indigo-800' },
  em_composicao: { label: 'Em Composição', className: 'bg-blue-100 text-blue-800' },
  aguardando_validacao: { label: 'Aguardando Validação', className: 'bg-yellow-100 text-yellow-800' },
  com_pendencias: { label: 'Com Pendências', className: 'bg-orange-100 text-orange-800' },
  pronta: { label: 'Pronta p/ Emissão', className: 'bg-teal-100 text-teal-800' },
  enfileirada: { label: 'Enfileirada', className: 'bg-amber-100 text-amber-800' },
  processando: { label: 'Processando', className: 'bg-amber-100 text-amber-800' },
  autorizada: { label: 'Autorizada', className: 'bg-emerald-100 text-emerald-800' },
  rejeitada: { label: 'Rejeitada', className: 'bg-red-100 text-red-800' },
  cancelada: { label: 'Cancelada', className: 'bg-slate-100 text-slate-600' },
  erro: { label: 'Erro', className: 'bg-red-100 text-red-800' },
};

type Props = {
  status: string;
  size?: 'sm' | 'md';
};

const NfeStatusBadge: React.FC<Props> = ({ status, size = 'sm' }) => {
  const config = STATUS_CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${config.className} ${sizeClass}`}>
      {config.label}
    </span>
  );
};

export default NfeStatusBadge;

export { STATUS_CONFIG };
