/**
 * printDre — Impressão/PDF do DRE (mesmo padrão de printBarcodeLabel)
 * Abre uma nova janela com HTML+CSS self-contained e dispara window.print().
 * O usuário pode imprimir ou salvar como PDF via dialog nativo do browser.
 */

export type DreRowForPrint = {
  key: string;
  label: string;
  value: number;
  kind?: 'subtotal' | 'info';
};

export type PrintDreParams = {
  rows: DreRowForPrint[];
  startDate: string | null;
  endDate: string | null;
  regime: 'competencia' | 'caixa';
  centroNome?: string | null;
  empresaNome: string;
  cnpj?: string | null;
};

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return '';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
}

export function printDreReport(params: PrintDreParams): void {
  const { rows, startDate, endDate, regime, centroNome, empresaNome, cnpj } = params;

  const periodo =
    startDate || endDate
      ? `${fmtDate(startDate)} a ${fmtDate(endDate)}`
      : 'Período corrente';

  const regimeLabel = regime === 'caixa' ? 'Caixa' : 'Competência';
  const geradoEm = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

  const rowsHtml = rows
    .map((row) => {
      const isZero = Math.abs(row.value) < 0.005;
      const valueClass = row.kind === 'info'
        ? 'val-info'
        : row.value < 0
          ? 'val-neg'
          : isZero
            ? 'val-zero'
            : 'val-pos';

      const trClass = row.kind === 'subtotal'
        ? 'tr-subtotal'
        : row.kind === 'info'
          ? 'tr-info'
          : row.label.startsWith('(-)') || row.label.startsWith('+/-')
            ? 'tr-item'
            : 'tr-normal';

      return `
        <tr class="${trClass}">
          <td class="col-label">${escapeHtml(row.label)}</td>
          <td class="col-val ${valueClass}">${fmtBRL(row.value)}</td>
        </tr>`;
    })
    .join('');

  const cnpjFormatted = fmtCnpj(cnpj);
  const cnpjHtml = cnpjFormatted ? ` — CNPJ ${escapeHtml(cnpjFormatted)}` : '';
  const centroHtml = centroNome ? `<div class="meta-item">Centro de custo: <strong>${escapeHtml(centroNome)}</strong></div>` : '';

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DRE — ${escapeHtml(empresaNome)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 16mm; }

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0; padding: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 10pt;
      color: #111827;
      background: #fff;
    }

    /* ── Cabeçalho ─────────────────────────────────── */
    .report-header {
      border-bottom: 2px solid #1d4ed8;
      padding-bottom: 8pt;
      margin-bottom: 12pt;
    }
    .report-title {
      font-size: 16pt;
      font-weight: 800;
      color: #1d4ed8;
      margin: 0 0 2pt 0;
      letter-spacing: -0.3pt;
    }
    .report-subtitle {
      font-size: 8pt;
      color: #6b7280;
      margin: 0 0 6pt 0;
    }
    .empresa-name {
      font-size: 11pt;
      font-weight: 700;
      color: #111827;
    }
    .empresa-cnpj {
      font-size: 8.5pt;
      color: #374151;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 16pt;
      margin-top: 6pt;
      font-size: 8.5pt;
      color: #374151;
    }
    .meta-item strong { color: #111827; }

    /* ── Tabela DRE ────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0;
    }
    thead tr {
      background: #1d4ed8;
      color: #fff;
    }
    thead th {
      padding: 5pt 8pt;
      font-size: 8.5pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4pt;
    }
    thead th.col-label { text-align: left; }
    thead th.col-val   { text-align: right; }

    tbody tr { border-bottom: 1px solid #f3f4f6; }
    tbody tr:last-child { border-bottom: none; }

    td {
      padding: 4pt 8pt;
      vertical-align: middle;
    }
    .col-label { text-align: left; }
    .col-val   { text-align: right; font-variant-numeric: tabular-nums; }

    /* ── Tipos de linha ───────────────────────────── */
    .tr-normal   { background: #fff; }
    .tr-item     { background: #f9fafb; }
    .tr-subtotal {
      background: #eff6ff;
      font-weight: 700;
      font-size: 10.5pt;
      border-top: 1px solid #bfdbfe;
      border-bottom: 1px solid #bfdbfe;
    }
    .tr-info {
      background: #fffbeb;
      font-style: italic;
      color: #92400e;
    }

    /* ── Cores de valores ─────────────────────────── */
    .val-pos  { color: #166534; }
    .val-neg  { color: #991b1b; }
    .val-zero { color: #9ca3af; }
    .val-info { color: #92400e; }
    .tr-subtotal .val-pos  { color: #1e3a8a; }
    .tr-subtotal .val-neg  { color: #7f1d1d; }

    /* ── Rodapé ───────────────────────────────────── */
    .report-footer {
      margin-top: 14pt;
      border-top: 1px solid #e5e7eb;
      padding-top: 6pt;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #9ca3af;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <p class="report-title">DRE</p>
    <p class="report-subtitle">Demonstrativo de Resultados do Exercício</p>
    <div class="empresa-name">${escapeHtml(empresaNome)}${cnpjHtml ? `<span class="empresa-cnpj">${cnpjHtml}</span>` : ''}</div>
    <div class="meta-row">
      <div class="meta-item">Período: <strong>${escapeHtml(periodo)}</strong></div>
      <div class="meta-item">Regime: <strong>${escapeHtml(regimeLabel)}</strong></div>
      ${centroHtml}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-label">Linha</th>
        <th class="col-val">Valor (R$)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="report-footer">
    <span>Gerado em ${escapeHtml(geradoEm)}</span>
    <span>Ultria ERP — relatório gerado pelo sistema</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=850,height=1100');
  if (!win) {
    // Fallback se popup blocker bloquear
    alert('Permita pop-ups para este site para imprimir o relatório.');
    return;
  }
  win.document.write(html);
  win.document.close();
  // Aguarda recursos carregarem antes de abrir o dialog de impressão
  win.addEventListener('load', () => {
    setTimeout(() => win.print(), 150);
  });
}
