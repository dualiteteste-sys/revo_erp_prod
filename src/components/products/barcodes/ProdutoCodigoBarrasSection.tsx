import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { useToast } from '@/contexts/ToastProvider';
import BarcodePreview from '@/components/barcodes/BarcodePreview';
import { isValidEan13, sanitizeBarcodeValue } from '@/lib/barcode/ean13';
import { renderBarcodeSvg } from '@/lib/barcode/renderSvg';
import { printBarcodeLabel, type BarcodeLabelTemplate } from '@/lib/barcode/print';
import {
  generateProdutoCodigoBarrasInterno,
  getProdutoCodigoBarras,
  upsertProdutoCodigoBarras,
  clearProdutoCodigoBarras,
  type BarcodeType,
} from '@/services/produtosCodigosBarras';

type Props = {
  produtoId: string | null | undefined;
  varianteId?: string | null | undefined;
  produtoNome?: string | null | undefined;
  sku?: string | null | undefined;
  precoVenda?: number | null | undefined;
  onChanged?: () => void;
};

const typeOptions: Array<{ value: BarcodeType; label: string; helper?: string }> = [
  { value: 'CODE128', label: 'Code 128 (interno)', helper: 'Recomendado para estoque/PDV. Gerado pelo sistema.' },
  { value: 'EAN13', label: 'EAN-13 (validar/entrada)', helper: 'Não geramos GTIN/EAN oficial automaticamente.' },
];

export default function ProdutoCodigoBarrasSection({
  produtoId,
  varianteId,
  produtoNome,
  sku,
  precoVenda,
  onChanged,
}: Props) {
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<{ type: BarcodeType; value: string; inherited: boolean } | null>(null);

  const [barcodeType, setBarcodeType] = useState<BarcodeType>('CODE128');
  const [barcodeValue, setBarcodeValue] = useState('');
  const [template, setTemplate] = useState<BarcodeLabelTemplate>('A4_SINGLE');
  const [showPrice, setShowPrice] = useState(true);

  const canUse = !!produtoId;

  const inherited = loaded?.inherited ?? false;
  const helper = useMemo(() => typeOptions.find((o) => o.value === barcodeType)?.helper ?? '', [barcodeType]);

  const isValueValid = useMemo(() => {
    const v = sanitizeBarcodeValue(barcodeValue);
    if (!v) return false;
    if (barcodeType === 'EAN13') return isValidEan13(v);
    return !/\\s/.test(v);
  }, [barcodeType, barcodeValue]);

  const load = useCallback(async () => {
    if (!produtoId) return;
    setLoading(true);
    try {
      const row = await getProdutoCodigoBarras({ produtoId, varianteId: varianteId ?? null });
      if (!row) {
        setLoaded(null);
        setBarcodeType('CODE128');
        setBarcodeValue('');
        return;
      }

      const isInherited = !!varianteId && row.variante_id === null;
      setLoaded({ type: row.barcode_type, value: row.barcode_value, inherited: isInherited });
      setBarcodeType(row.barcode_type);
      setBarcodeValue(row.barcode_value);
    } catch (e: any) {
      addToast(e?.message || 'Não foi possível carregar o código de barras.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, produtoId, varianteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleValidate = () => {
    if (!barcodeValue.trim()) {
      addToast('Informe um código de barras para validar.', 'warning');
      return;
    }
    if (barcodeType === 'EAN13') {
      if (!isValidEan13(barcodeValue)) {
        addToast('EAN-13 inválido (checksum).', 'error');
        return;
      }
      addToast('EAN-13 válido.', 'success');
      return;
    }
    if (/\\s/.test(barcodeValue)) {
      addToast('Código interno não pode conter espaços.', 'error');
      return;
    }
    addToast('Código válido.', 'success');
  };

  const handleGenerateInternal = async () => {
    if (!produtoId) return;
    setLoading(true);
    try {
      const row = await generateProdutoCodigoBarrasInterno({ produtoId, varianteId: varianteId ?? null });
      setLoaded({ type: row.barcode_type, value: row.barcode_value, inherited: false });
      setBarcodeType(row.barcode_type);
      setBarcodeValue(row.barcode_value);
      addToast('Código interno gerado.', 'success');
      onChanged?.();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar código interno.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!produtoId) return;
    const value = sanitizeBarcodeValue(barcodeValue);
    if (!value) {
      addToast('Código de barras é obrigatório.', 'warning');
      return;
    }
    setLoading(true);
    try {
      await upsertProdutoCodigoBarras({
        produtoId,
        varianteId: varianteId ?? null,
        barcodeType,
        barcodeValue: value,
      });
      addToast('Código de barras atualizado.', 'success');
      await load();
      onChanged?.();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar código de barras.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!produtoId) return;
    const ok = window.confirm('Tem certeza que deseja limpar o código de barras?');
    if (!ok) return;
    setLoading(true);
    try {
      await clearProdutoCodigoBarras({ produtoId, varianteId: varianteId ?? null });
      addToast('Código removido.', 'success');
      await load();
      onChanged?.();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao limpar código de barras.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!isValueValid) {
      addToast('Informe um código válido antes de imprimir.', 'warning');
      return;
    }
    const value = sanitizeBarcodeValue(barcodeValue);
    try {
      const svgHtml = renderBarcodeSvg({ value, type: barcodeType, width: 520, height: 160, margin: 10 });
      printBarcodeLabel({
        template,
        barcodeValue: value,
        svg: svgHtml,
        produtoNome: produtoNome ?? 'Produto',
        sku: sku ?? null,
        precoVenda: precoVenda ?? null,
        showPrice,
      });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao abrir impressão.', 'error');
    }
  };

  return (
    <Section
      title="Código de barras (interno)"
      description="Gere um código interno para leitura no estoque/PDV. Para GTIN/EAN oficial (marketplaces), use o campo GTIN/EAN acima."
    >
      {!canUse ? (
        <div className="sm:col-span-6 text-sm text-gray-600">
          Salve o produto para habilitar geração e impressão de código de barras.
        </div>
      ) : null}

      <Select
        label="Tipo"
        name="barcode_type"
        value={barcodeType}
        onChange={(e) => setBarcodeType(e.target.value as BarcodeType)}
        className="sm:col-span-2"
        disabled={!canUse || loading}
      >
        {typeOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>

      <Input
        label="Código"
        name="barcode_value"
        value={barcodeValue}
        onChange={(e) => setBarcodeValue(e.target.value)}
        className="sm:col-span-4"
        placeholder={barcodeType === 'EAN13' ? 'Ex.: 7891234567895' : 'Ex.: UL3FA1B2C3D4E5'}
        disabled={!canUse || loading}
      />

      <div className="sm:col-span-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleValidate}
          disabled={!canUse || loading}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold disabled:opacity-50"
        >
          Validar
        </button>

        <button
          type="button"
          onClick={() => void handleGenerateInternal()}
          disabled={!canUse || loading}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-bold disabled:opacity-50"
        >
          Gerar código interno
        </button>

        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={!canUse || loading}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold disabled:opacity-50"
        >
          Aplicar
        </button>

        <button
          type="button"
          onClick={() => void handleClear()}
          disabled={!canUse || loading}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-red-600 disabled:opacity-50"
        >
          Limpar
        </button>

        <div className="ml-auto text-xs text-gray-500">
          {inherited ? 'Herdado do produto pai.' : loaded ? 'Código próprio.' : 'Sem código.'}
        </div>
      </div>

      <div className="sm:col-span-6 text-xs text-gray-500">{helper}</div>

      {canUse && isValueValid ? (
        <div className="sm:col-span-6">
          <BarcodePreview value={sanitizeBarcodeValue(barcodeValue)} type={barcodeType} />
        </div>
      ) : null}

      <Select
        label="Template de etiqueta"
        name="barcode_template"
        value={template}
        onChange={(e) => setTemplate(e.target.value as BarcodeLabelTemplate)}
        className="sm:col-span-3"
        disabled={!canUse || loading}
      >
        <option value="A4_SINGLE">A4 (1 etiqueta por página)</option>
        <option value="THERMAL_50X30">Térmica 50×30mm</option>
      </Select>

      <Select
        label="Mostrar preço"
        name="barcode_show_price"
        value={showPrice ? 'yes' : 'no'}
        onChange={(e) => setShowPrice(e.target.value === 'yes')}
        className="sm:col-span-3"
        disabled={!canUse || loading}
      >
        <option value="yes">Sim</option>
        <option value="no">Não</option>
      </Select>

      <div className="sm:col-span-6 flex justify-end">
        <button
          type="button"
          onClick={handlePrint}
          disabled={!canUse || loading || !isValueValid}
          className="px-4 py-3 rounded-lg bg-gray-900 text-white font-bold hover:bg-gray-800 disabled:opacity-50"
        >
          Imprimir etiqueta
        </button>
      </div>
    </Section>
  );
}

