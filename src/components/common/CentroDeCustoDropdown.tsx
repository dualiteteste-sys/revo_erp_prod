import React from 'react';
import Select from '@/components/ui/forms/Select';
import { listAllCentrosDeCusto, type CentroDeCustoListItem } from '@/services/centrosDeCusto';
import { useToast } from '@/contexts/ToastProvider';

type Props = {
  valueId?: string | null;
  valueName?: string | null;
  onChange: (id: string | null, name?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  includeEmpty?: boolean;
  className?: string;
};

function formatCentroLabel(cc: CentroDeCustoListItem) {
  const code = cc.codigo ? `${cc.codigo} ` : '';
  const indent = cc.nivel && cc.nivel > 0 ? `${'—'.repeat(Math.min(6, cc.nivel))} ` : '';
  return `${indent}${code}${cc.nome}`.trim();
}

export default function CentroDeCustoDropdown({
  valueId = null,
  valueName,
  onChange,
  disabled,
  placeholder = 'Selecionar…',
  includeEmpty = true,
  className,
}: Props) {
  const { addToast } = useToast();
  const [items, setItems] = React.useState<CentroDeCustoListItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
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
  }, [addToast]);

  const selectedId = React.useMemo(() => {
    if (valueId) return valueId;
    const name = (valueName || '').trim().toLowerCase();
    if (!name) return '';
    const found = items.find((cc) => (cc.nome || '').trim().toLowerCase() === name);
    return found?.id || '';
  }, [items, valueId, valueName]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value || null;
    if (!nextId) {
      onChange(null);
      return;
    }
    const found = items.find((cc) => cc.id === nextId);
    onChange(nextId, found?.nome);
  };

  return (
    <Select
      name="centro_de_custo_id"
      value={selectedId}
      onChange={handleChange}
      disabled={disabled || loading}
      className={className}
    >
      {includeEmpty ? (
        <option value="">
          {loading ? 'Carregando…' : placeholder}
        </option>
      ) : null}
      {items.map((cc) => (
        <option key={cc.id} value={cc.id}>
          {formatCentroLabel(cc)}
        </option>
      ))}
    </Select>
  );
}

