import React from 'react';
import Select from '@/components/ui/forms/Select';
import { searchMeiosPagamento, type MeioPagamentoTipo } from '@/services/meiosPagamento';
import { useToast } from '@/contexts/ToastProvider';

type Props = {
  tipo: MeioPagamentoTipo;
  value: string | null;
  onChange: (name: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export default function MeioPagamentoDropdown({
  tipo,
  value,
  onChange,
  disabled,
  placeholder = 'Selecionar…',
  className,
}: Props) {
  const { addToast } = useToast();
  const [items, setItems] = React.useState<Array<{ id: string; nome: string }>>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const data = await searchMeiosPagamento({ tipo, q: null, limit: 50 });
        if (!cancelled) setItems(data);
      } catch (e: any) {
        if (!cancelled) addToast(e?.message || 'Erro ao listar meios.', 'error');
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [addToast, tipo]);

  const normalized = (value || '').trim();
  const hasValueInList = normalized
    ? items.some((m) => (m.nome || '').trim().toLowerCase() === normalized.toLowerCase())
    : true;

  return (
    <Select
      name={tipo === 'pagamento' ? 'forma_pagamento' : 'forma_recebimento'}
      value={normalized}
      onChange={(e) => onChange(e.target.value ? e.target.value : null)}
      disabled={disabled || loading}
      className={className}
    >
      <option value="">{loading ? 'Carregando…' : placeholder}</option>
      {!hasValueInList && normalized ? (
        <option value={normalized}>{`${normalized} (não cadastrado/ inativo)`}</option>
      ) : null}
      {items.map((m) => (
        <option key={m.id} value={m.nome}>
          {m.nome}
        </option>
      ))}
    </Select>
  );
}

