import React, { useEffect, useMemo, useState } from 'react';

import Select from '@/components/ui/forms/Select';
import { logger } from '@/lib/logger';
import { listUnidades, type UnidadeMedida } from '@/services/unidades';

type Props = {
  label?: React.ReactNode | null;
  name?: string;
  value: string | null | undefined;
  onChange: (sigla: string | null) => void;
  disabled?: boolean;
  required?: boolean;
  uiSize?: 'default' | 'sm';
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
};

let unidadesCache: UnidadeMedida[] | null = null;
let unidadesInflight: Promise<UnidadeMedida[]> | null = null;

async function getUnidadesCached() {
  if (unidadesCache) return unidadesCache;
  if (unidadesInflight) return unidadesInflight;
  unidadesInflight = listUnidades()
    .then((rows) => {
      unidadesCache = Array.isArray(rows) ? rows : [];
      return unidadesCache;
    })
    .finally(() => {
      unidadesInflight = null;
    });
  return unidadesInflight;
}

function normalizeSigla(v: string | null | undefined) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

export default function UnidadeMedidaSelect({
  label,
  name = 'unidade',
  value,
  onChange,
  disabled,
  required,
  uiSize,
  className,
  placeholder,
  allowEmpty = true,
}: Props) {
  const [unidades, setUnidades] = useState<UnidadeMedida[] | null>(unidadesCache);

  useEffect(() => {
    let canceled = false;
    if (unidades) return;

    void getUnidadesCached()
      .then((rows) => {
        if (canceled) return;
        setUnidades(rows);
      })
      .catch((error) => {
        logger.warn('[UnidadeMedidaSelect] Falha ao carregar unidades', { error });
        if (!canceled) setUnidades([]);
      });

    return () => {
      canceled = true;
    };
  }, [unidades]);

  const normalizedValue = normalizeSigla(value);

  const options = useMemo(() => {
    const rows = (unidades ?? []).filter((u) => u.ativo);
    return rows;
  }, [unidades]);

  const hasNormalized = normalizedValue
    ? options.some((u) => u.sigla.toUpperCase() === normalizedValue)
    : true;

  return (
    <Select
      label={label === undefined ? 'Unidade' : label}
      name={name}
      value={normalizedValue ?? ''}
      onChange={(e) => onChange(normalizeSigla(e.target.value))}
      disabled={disabled}
      required={required}
      uiSize={uiSize}
      className={className}
    >
      {allowEmpty ? <option value="">{placeholder ?? 'Selecione...'}</option> : null}
      {!hasNormalized && normalizedValue ? (
        <option value={normalizedValue}>{normalizedValue} (não cadastrada)</option>
      ) : null}
      {options.map((u) => (
        <option key={u.id} value={u.sigla}>
          {u.sigla} - {u.descricao}
        </option>
      ))}
    </Select>
  );
}
