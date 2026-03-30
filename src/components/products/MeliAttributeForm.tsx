import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMeliCategoryDetail, type MeliCategoryAttribute } from '@/services/meliAdmin';

type AttributeValue = {
  attribute_id: string;
  attribute_name: string;
  value_id?: string;
  value_name: string;
};

type Props = {
  empresaId: string;
  ecommerceId: string;
  categoryId: string;
  initialValues?: AttributeValue[];
  /** Auto-fill hints from product data */
  autoFill?: {
    brand?: string | null;
    model?: string | null;
    gtin?: string | null;
    condition?: string | null;
  };
  onChange: (attributes: AttributeValue[]) => void;
  className?: string;
};

export default function MeliAttributeForm({
  empresaId,
  ecommerceId,
  categoryId,
  initialValues = [],
  autoFill,
  onChange,
  className,
}: Props) {
  const [attributes, setAttributes] = useState<MeliCategoryAttribute[]>([]);
  const [values, setValues] = useState<Record<string, { value_id?: string; value_name: string }>>({});
  const [loading, setLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

  // Load category attributes
  useEffect(() => {
    if (!categoryId) return;
    setLoading(true);
    getMeliCategoryDetail(empresaId, ecommerceId, categoryId)
      .then((data) => {
        const attrs = data.category?.attributes ?? [];
        setAttributes(attrs);
        // Initialize values from initialValues and autoFill
        const initMap: Record<string, { value_id?: string; value_name: string }> = {};
        for (const iv of initialValues) {
          initMap[iv.attribute_id] = { value_id: iv.value_id, value_name: iv.value_name };
        }
        // Auto-fill standard attributes if not already set
        if (autoFill?.brand && !initMap['BRAND']) {
          initMap['BRAND'] = { value_name: autoFill.brand };
        }
        if (autoFill?.model && !initMap['MODEL']) {
          initMap['MODEL'] = { value_name: autoFill.model };
        }
        if (autoFill?.gtin && !initMap['GTIN']) {
          initMap['GTIN'] = { value_name: autoFill.gtin };
        }
        if (autoFill?.condition && !initMap['ITEM_CONDITION']) {
          const condMap: Record<string, string> = {
            novo: '2230284', new: '2230284',
            usado: '2230581', used: '2230581',
          };
          const normalized = (autoFill.condition || '').toLowerCase().trim();
          initMap['ITEM_CONDITION'] = {
            value_id: condMap[normalized],
            value_name: normalized === 'novo' || normalized === 'new' ? 'Novo' : 'Usado',
          };
        }
        setValues(initMap);
      })
      .catch(() => setAttributes([]))
      .finally(() => setLoading(false));
  }, [categoryId, empresaId, ecommerceId]);

  // Emit changes
  const emitChange = useCallback(
    (newValues: Record<string, { value_id?: string; value_name: string }>) => {
      const result: AttributeValue[] = [];
      for (const [attrId, val] of Object.entries(newValues)) {
        if (!val.value_name?.trim()) continue;
        const attr = attributes.find((a) => a.id === attrId);
        result.push({
          attribute_id: attrId,
          attribute_name: attr?.name ?? attrId,
          value_id: val.value_id,
          value_name: val.value_name,
        });
      }
      onChange(result);
    },
    [attributes, onChange],
  );

  const handleValueChange = (attrId: string, valueObj: { value_id?: string; value_name: string }) => {
    const next = { ...values, [attrId]: valueObj };
    setValues(next);
    emitChange(next);
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-gray-400', className)}>
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">Carregando atributos da categoria...</span>
      </div>
    );
  }

  if (attributes.length === 0) {
    return (
      <div className={cn('text-center text-sm text-gray-400 py-6', className)}>
        Nenhum atributo encontrado para esta categoria.
      </div>
    );
  }

  const isRequired = (attr: MeliCategoryAttribute) =>
    attr.required || (attr.tags && (attr.tags as any).required === true);

  const requiredAttrs = attributes.filter(isRequired);
  const optionalAttrs = attributes.filter((a) => !isRequired(a));

  const renderField = (attr: MeliCategoryAttribute) => {
    const val = values[attr.id] || { value_name: '' };
    const required = isRequired(attr);

    // Select/Combobox for list types with predefined values
    if ((attr.value_type === 'list' || attr.values?.length > 0) && attr.values?.length <= 100) {
      return (
        <div key={attr.id} className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">
            {attr.name}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <select
            className="w-full rounded-lg border border-gray-200/80 bg-white/70 backdrop-blur-sm px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
            value={val.value_id || val.value_name || ''}
            onChange={(e) => {
              const selectedOpt = attr.values.find((v) => v.id === e.target.value || v.name === e.target.value);
              handleValueChange(attr.id, {
                value_id: selectedOpt?.id,
                value_name: selectedOpt?.name || e.target.value,
              });
            }}
          >
            <option value="">Selecione...</option>
            {attr.values.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // Number with unit
    if (attr.value_type === 'number_unit' && attr.allowed_units?.length) {
      return (
        <div key={attr.id} className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">
            {attr.name}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              className="flex-1 rounded-lg border border-gray-200/80 bg-white/70 backdrop-blur-sm px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
              placeholder="Valor"
              value={val.value_name?.split(' ')[0] || ''}
              onChange={(e) => {
                const unit = val.value_name?.split(' ')[1] || attr.allowed_units?.[0]?.id || '';
                handleValueChange(attr.id, { value_name: `${e.target.value} ${unit}`.trim() });
              }}
            />
            <select
              className="w-24 rounded-lg border border-gray-200/80 bg-white/70 backdrop-blur-sm px-2 py-2 text-sm"
              value={val.value_name?.split(' ')[1] || attr.allowed_units?.[0]?.id || ''}
              onChange={(e) => {
                const num = val.value_name?.split(' ')[0] || '';
                handleValueChange(attr.id, { value_name: `${num} ${e.target.value}`.trim() });
              }}
            >
              {attr.allowed_units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    // Boolean
    if (attr.value_type === 'boolean') {
      return (
        <div key={attr.id} className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-700 flex-1">
            {attr.name}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <button
            type="button"
            onClick={() => {
              const current = val.value_name === 'Sim';
              handleValueChange(attr.id, { value_name: current ? 'Não' : 'Sim' });
            }}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              val.value_name === 'Sim' ? 'bg-blue-500' : 'bg-gray-300',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                val.value_name === 'Sim' ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>
      );
    }

    // Number
    if (attr.value_type === 'number') {
      return (
        <div key={attr.id} className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">
            {attr.name}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            type="number"
            className="w-full rounded-lg border border-gray-200/80 bg-white/70 backdrop-blur-sm px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
            placeholder={attr.name}
            value={val.value_name || ''}
            onChange={(e) => handleValueChange(attr.id, { value_name: e.target.value })}
          />
        </div>
      );
    }

    // Default: text input
    return (
      <div key={attr.id} className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">
          {attr.name}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-gray-200/80 bg-white/70 backdrop-blur-sm px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
          placeholder={attr.name}
          value={val.value_name || ''}
          onChange={(e) => handleValueChange(attr.id, { value_name: e.target.value })}
        />
      </div>
    );
  };

  return (
    <div className={cn('space-y-5', className)}>
      {/* Required attributes */}
      {requiredAttrs.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Atributos Obrigatórios
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {requiredAttrs.map(renderField)}
          </div>
        </div>
      )}

      {/* Optional attributes (collapsible) */}
      {optionalAttrs.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowOptional(!showOptional)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
          >
            {showOptional ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Atributos Opcionais ({optionalAttrs.length})
          </button>
          {showOptional && (
            <div className="grid gap-3 sm:grid-cols-2">
              {optionalAttrs.map(renderField)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
