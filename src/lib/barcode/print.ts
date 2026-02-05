export type BarcodeLabelTemplate = 'A4_SINGLE' | 'THERMAL_50X30';

type PrintParams = {
  template: BarcodeLabelTemplate;
  barcodeValue: string;
  svg: string;
  produtoNome: string;
  sku?: string | null;
  precoVenda?: number | null;
  showPrice?: boolean;
};

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function printBarcodeLabel(params: PrintParams) {
  const sku = params.sku ? escapeHtml(params.sku) : '—';
  const nome = escapeHtml(params.produtoNome || 'Produto');
  const barcodeValue = escapeHtml(params.barcodeValue || '');
  const preco =
    params.showPrice && typeof params.precoVenda === 'number' ? formatBRL(Number(params.precoVenda)) : null;

  const pageCss =
    params.template === 'THERMAL_50X30'
      ? '@page { size: 50mm 30mm; margin: 2mm; }'
      : '@page { size: A4; margin: 12mm; }';

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Etiqueta</title>
  <style>
    ${pageCss}
    html, body { padding: 0; margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    .wrap { display: flex; align-items: flex-start; justify-content: center; }
    .label {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px;
      width: ${params.template === 'THERMAL_50X30' ? '46mm' : '90mm'};
    }
    .nome { font-size: 12px; font-weight: 700; color: #111827; line-height: 1.2; }
    .meta { margin-top: 4px; display: flex; justify-content: space-between; gap: 8px; font-size: 10px; color: #374151; }
    .sku { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; }
    .preco { font-weight: 700; }
    .barcode { margin-top: 8px; }
    .barcode svg { width: 100%; height: auto; display: block; }
    .value { margin-top: 6px; font-size: 10px; text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; color: #111827; word-break: break-all; }
    @media print {
      .label { border: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="label">
      <div class="nome">${nome}</div>
      <div class="meta">
        <div class="sku">SKU: ${sku}</div>
        ${preco ? `<div class="preco">${escapeHtml(preco)}</div>` : ''}
      </div>
      <div class="barcode">${params.svg}</div>
      <div class="value">${barcodeValue}</div>
    </div>
  </div>
  <script>
    window.focus();
    setTimeout(() => window.print(), 200);
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) {
    throw new Error('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-up.');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

