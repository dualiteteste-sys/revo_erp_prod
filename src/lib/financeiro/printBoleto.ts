/**
 * printBoleto — Impressão/PDF de boleto bancário padrão brasileiro.
 * Gera HTML self-contained com layout da ficha de compensação + código de barras ITF-25 em SVG.
 * Abre nova janela e dispara window.print() (mesmo padrão de printDre.ts).
 */

import type { CobrancaBancaria } from '@/services/cobrancas';
import type { FiscalNfeEmitente } from '@/services/fiscalNfeSettings';
import type { PartnerDetails } from '@/services/partners';

// ── Types ──────────────────────────────────────────────────

export type PrintBoletoParams = {
  // Cedente (empresa)
  cedenteNome: string;
  cedenteCnpj: string;
  cedenteEndereco: string;
  // Sacado (cliente)
  sacadoNome: string;
  sacadoDocumento: string;
  sacadoEndereco: string;
  // Banco / Conta
  bancoNome: string;
  bancoCodigo: string;
  agenciaConta: string;
  // Boleto
  nossoNumero: string;
  carteira: string;
  linhaDigitavel: string;
  codigoBarras: string;
  valor: number;
  dataVencimento: string;
  dataEmissao: string;
  documentoRef: string;
  descricao: string;
  observacoes: string;
};

// ── Helpers ────────────────────────────────────────────────

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function fmtCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return '';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  if (digits.length === 11)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  return cnpj;
}

// ── Barcode ITF-25 (Interleaved Two of Five) ───────────────

const ITF_PATTERNS: Record<string, string> = {
  '0': 'nnwwn',
  '1': 'wnnnw',
  '2': 'nwnnw',
  '3': 'wwnnn',
  '4': 'nnwnw',
  '5': 'wnwnn',
  '6': 'nwwnn',
  '7': 'nnnww',
  '8': 'wnnwn',
  '9': 'nwnwn',
};

function generateItf25Svg(digits: string, width = 540, height = 50): string {
  if (!digits || digits.length === 0 || digits.length % 2 !== 0) return '';

  const narrowWidth = 1;
  const wideWidth = 3;

  // Calculate total width
  // Start: nnnn (4 narrow bars)
  // End: wnn (1 wide + 2 narrow)
  // Each pair: 5 bars + 5 spaces = 10 elements
  let totalUnits = 4; // start
  const numPairs = digits.length / 2;
  for (let i = 0; i < numPairs; i++) {
    const d1 = digits[i * 2];
    const d2 = digits[i * 2 + 1];
    const p1 = ITF_PATTERNS[d1];
    const p2 = ITF_PATTERNS[d2];
    if (!p1 || !p2) return '';
    for (let j = 0; j < 5; j++) {
      totalUnits += p1[j] === 'w' ? wideWidth : narrowWidth; // bar
      totalUnits += p2[j] === 'w' ? wideWidth : narrowWidth; // space
    }
  }
  totalUnits += wideWidth + narrowWidth + narrowWidth; // end

  const scale = width / totalUnits;
  let x = 0;
  const bars: string[] = [];

  // Helper to draw a bar
  const addBar = (w: number, isBlack: boolean) => {
    if (isBlack) {
      bars.push(`<rect x="${(x * scale).toFixed(2)}" y="0" width="${(w * scale).toFixed(2)}" height="${height}" fill="#000"/>`);
    }
    x += w;
  };

  // Start pattern: narrow bar, narrow space, narrow bar, narrow space
  addBar(narrowWidth, true);
  addBar(narrowWidth, false);
  addBar(narrowWidth, true);
  addBar(narrowWidth, false);

  // Encode pairs
  for (let i = 0; i < numPairs; i++) {
    const d1 = digits[i * 2];
    const d2 = digits[i * 2 + 1];
    const p1 = ITF_PATTERNS[d1]!;
    const p2 = ITF_PATTERNS[d2]!;
    for (let j = 0; j < 5; j++) {
      addBar(p1[j] === 'w' ? wideWidth : narrowWidth, true);  // bar
      addBar(p2[j] === 'w' ? wideWidth : narrowWidth, false); // space
    }
  }

  // End pattern: wide bar, narrow space, narrow bar
  addBar(wideWidth, true);
  addBar(narrowWidth, false);
  addBar(narrowWidth, true);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bars.join('')}</svg>`;
}

// ── Build params from cobrança + emitente + parceiro ───────

export function buildBoletoParams(
  cobranca: CobrancaBancaria,
  emitente: FiscalNfeEmitente | null,
  parceiro: PartnerDetails | null,
): PrintBoletoParams {
  const cedenteEndereco = emitente
    ? [
        emitente.endereco_logradouro,
        emitente.endereco_numero,
        emitente.endereco_bairro,
        emitente.endereco_municipio,
        emitente.endereco_uf,
        emitente.endereco_cep,
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  const addr = parceiro?.enderecos?.[0];
  const sacadoEndereco = addr
    ? [addr.logradouro, addr.numero, addr.bairro, addr.cidade, addr.uf, addr.cep].filter(Boolean).join(', ')
    : '';

  return {
    cedenteNome: emitente?.razao_social || 'Empresa',
    cedenteCnpj: emitente?.cnpj || '',
    cedenteEndereco,
    sacadoNome: parceiro?.nome || cobranca.cliente_nome || '',
    sacadoDocumento: parceiro?.doc_unico || '',
    sacadoEndereco,
    bancoNome: cobranca.conta_nome || '',
    bancoCodigo: '',
    agenciaConta: '',
    nossoNumero: cobranca.nosso_numero || '',
    carteira: cobranca.carteira_codigo || '',
    linhaDigitavel: cobranca.linha_digitavel || '',
    codigoBarras: cobranca.codigo_barras || '',
    valor: cobranca.valor_atual || cobranca.valor_original || 0,
    dataVencimento: cobranca.data_vencimento || '',
    dataEmissao: cobranca.data_emissao || '',
    documentoRef: cobranca.documento_ref || '',
    descricao: cobranca.descricao || '',
    observacoes: cobranca.observacoes || '',
  };
}

// ── Main print function ────────────────────────────────────

export function printBoleto(params: PrintBoletoParams): void {
  const {
    cedenteNome, cedenteCnpj, cedenteEndereco,
    sacadoNome, sacadoDocumento, sacadoEndereco,
    bancoNome, bancoCodigo, agenciaConta,
    nossoNumero, carteira, linhaDigitavel, codigoBarras,
    valor, dataVencimento, dataEmissao, documentoRef, descricao, observacoes,
  } = params;

  const geradoEm = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const barcodeSvg = codigoBarras ? generateItf25Svg(codigoBarras.replace(/\D/g, '')) : '';

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Boleto — ${escapeHtml(documentoRef || sacadoNome)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 9pt;
      color: #111;
      background: #fff;
    }

    .boleto-container { max-width: 720px; margin: 0 auto; }

    /* ── Recibo do Sacado (canhoto) ─────────── */
    .recibo-sacado {
      border: 1px solid #444;
      padding: 8pt 10pt;
      margin-bottom: 2pt;
    }
    .recibo-sacado .recibo-title {
      font-size: 8pt; font-weight: 700; text-transform: uppercase;
      color: #333; margin-bottom: 6pt; letter-spacing: 0.5pt;
    }
    .recibo-row { display: flex; gap: 10pt; margin-bottom: 3pt; font-size: 8pt; }
    .recibo-row .label { font-weight: 600; color: #555; min-width: 80pt; }
    .recibo-row .value { color: #111; }

    /* ── Linha de corte ───────────────────── */
    .cut-line {
      border-top: 1px dashed #999;
      margin: 6pt 0;
      position: relative;
    }
    .cut-line::after {
      content: '✂ Corte aqui';
      position: absolute; top: -6pt; right: 0;
      font-size: 7pt; color: #999; background: #fff; padding: 0 4pt;
    }

    /* ── Ficha de Compensação ─────────────── */
    .ficha {
      border: 2px solid #111;
    }

    .ficha-header {
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid #111;
      padding: 6pt 10pt;
    }
    .ficha-header .banco-info {
      display: flex; align-items: center; gap: 8pt;
    }
    .ficha-header .banco-nome {
      font-size: 14pt; font-weight: 800; letter-spacing: -0.3pt;
    }
    .ficha-header .banco-codigo {
      font-size: 14pt; font-weight: 800;
      border-left: 2px solid #111; border-right: 2px solid #111;
      padding: 0 8pt;
    }
    .ficha-header .linha-digitavel {
      font-size: 10pt; font-weight: 700; letter-spacing: 0.5pt;
      font-variant-numeric: tabular-nums;
    }

    .ficha-body { padding: 0; }

    .ficha-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      border-bottom: 1px solid #ccc;
    }
    .ficha-grid-wide {
      display: grid;
      grid-template-columns: 3fr 1fr;
      border-bottom: 1px solid #ccc;
    }
    .ficha-grid-full {
      border-bottom: 1px solid #ccc;
    }

    .field {
      padding: 4pt 8pt;
      border-right: 1px solid #ccc;
      min-height: 30pt;
    }
    .field:last-child { border-right: none; }
    .field-label {
      font-size: 6.5pt; font-weight: 600; text-transform: uppercase;
      color: #666; letter-spacing: 0.3pt; margin-bottom: 1pt;
    }
    .field-value {
      font-size: 8.5pt; color: #111;
      word-break: break-word;
    }
    .field-value-large {
      font-size: 11pt; font-weight: 700; color: #111;
      font-variant-numeric: tabular-nums;
    }
    .field-right { text-align: right; }

    /* ── Barcode ──────────────────────────── */
    .barcode-section {
      padding: 8pt 10pt 6pt;
      text-align: center;
    }
    .barcode-section svg { display: block; margin: 0 auto; }

    /* ── Sacado section ──────────────────── */
    .sacado-section {
      padding: 6pt 10pt;
      border-top: 1px solid #ccc;
    }
    .sacado-section .field-label { margin-bottom: 2pt; }

    /* ── Footer ──────────────────────────── */
    .print-footer {
      margin-top: 10pt;
      font-size: 7pt;
      color: #999;
      display: flex;
      justify-content: space-between;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="boleto-container">

    <!-- ── Recibo do Sacado ───────────────── -->
    <div class="recibo-sacado">
      <div class="recibo-title">Recibo do Sacado</div>
      <div class="recibo-row">
        <span class="label">Cedente:</span>
        <span class="value">${escapeHtml(cedenteNome)}${cedenteCnpj ? ` — CNPJ ${escapeHtml(fmtCnpj(cedenteCnpj))}` : ''}</span>
      </div>
      <div class="recibo-row">
        <span class="label">Sacado:</span>
        <span class="value">${escapeHtml(sacadoNome)}${sacadoDocumento ? ` — ${escapeHtml(fmtCnpj(sacadoDocumento))}` : ''}</span>
      </div>
      <div class="recibo-row">
        <span class="label">Nosso Número:</span>
        <span class="value">${escapeHtml(nossoNumero || '—')}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 4pt;">
        <div class="recibo-row">
          <span class="label">Vencimento:</span>
          <span class="value" style="font-weight: 700;">${escapeHtml(fmtDate(dataVencimento))}</span>
        </div>
        <div class="recibo-row">
          <span class="label">Valor:</span>
          <span class="value" style="font-weight: 700;">${escapeHtml(fmtBRL(valor))}</span>
        </div>
      </div>
      ${descricao ? `<div class="recibo-row"><span class="label">Descrição:</span><span class="value">${escapeHtml(descricao)}</span></div>` : ''}
    </div>

    <div class="cut-line"></div>

    <!-- ── Ficha de Compensação ───────────── -->
    <div class="ficha">
      <div class="ficha-header">
        <div class="banco-info">
          <span class="banco-nome">${escapeHtml(bancoNome || 'Banco')}</span>
          ${bancoCodigo ? `<span class="banco-codigo">${escapeHtml(bancoCodigo)}</span>` : ''}
        </div>
        <div class="linha-digitavel">${escapeHtml(linhaDigitavel || '—')}</div>
      </div>

      <div class="ficha-body">
        <!-- Linha 1: Cedente + Agência/Conta -->
        <div class="ficha-grid-wide">
          <div class="field">
            <div class="field-label">Cedente</div>
            <div class="field-value">${escapeHtml(cedenteNome)}${cedenteCnpj ? ` — CNPJ ${escapeHtml(fmtCnpj(cedenteCnpj))}` : ''}</div>
          </div>
          <div class="field field-right">
            <div class="field-label">Agência / Código Cedente</div>
            <div class="field-value">${escapeHtml(agenciaConta || '—')}</div>
          </div>
        </div>

        <!-- Linha 2: Data emissão, Doc, Espécie, Valor -->
        <div class="ficha-grid">
          <div class="field">
            <div class="field-label">Data do Documento</div>
            <div class="field-value">${escapeHtml(fmtDate(dataEmissao))}</div>
          </div>
          <div class="field">
            <div class="field-label">Nº do Documento</div>
            <div class="field-value">${escapeHtml(documentoRef || '—')}</div>
          </div>
          <div class="field">
            <div class="field-label">Carteira</div>
            <div class="field-value">${escapeHtml(carteira || '—')}</div>
          </div>
          <div class="field field-right">
            <div class="field-label">Nosso Número</div>
            <div class="field-value">${escapeHtml(nossoNumero || '—')}</div>
          </div>
        </div>

        <!-- Linha 3: Vencimento + Valor -->
        <div class="ficha-grid-wide">
          <div class="field">
            <div class="field-label">Instruções / Descrição</div>
            <div class="field-value">${escapeHtml(descricao || '—')}</div>
            ${observacoes ? `<div class="field-value" style="margin-top:2pt;color:#555;font-size:7.5pt;">${escapeHtml(observacoes)}</div>` : ''}
          </div>
          <div class="field field-right">
            <div class="field-label">Data de Vencimento</div>
            <div class="field-value-large">${escapeHtml(fmtDate(dataVencimento))}</div>
            <div class="field-label" style="margin-top:6pt;">Valor do Documento</div>
            <div class="field-value-large">${escapeHtml(fmtBRL(valor))}</div>
          </div>
        </div>

        <!-- Sacado -->
        <div class="sacado-section">
          <div class="field-label">Sacado</div>
          <div class="field-value">
            ${escapeHtml(sacadoNome)}${sacadoDocumento ? ` — ${escapeHtml(fmtCnpj(sacadoDocumento))}` : ''}
          </div>
          ${sacadoEndereco ? `<div class="field-value" style="font-size:7.5pt;color:#555;margin-top:1pt;">${escapeHtml(sacadoEndereco)}</div>` : ''}
        </div>

        <!-- Código de barras -->
        ${barcodeSvg ? `
        <div class="barcode-section">
          ${barcodeSvg}
        </div>
        ` : `
        <div class="barcode-section" style="padding: 12pt; color: #999; font-size: 8pt;">
          Código de barras não disponível. Preencha o campo "Código de Barras" na cobrança.
        </div>
        `}
      </div>
    </div>

    <!-- Endereço do cedente -->
    ${cedenteEndereco ? `
    <div style="margin-top: 4pt; font-size: 7pt; color: #777;">
      Cedente: ${escapeHtml(cedenteEndereco)}
    </div>
    ` : ''}

    <div class="print-footer">
      <span>Gerado em ${escapeHtml(geradoEm)}</span>
      <span>Ultria ERP — boleto gerado pelo sistema</span>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=850,height=1100');
  if (!win) {
    alert('Permita pop-ups para este site para imprimir o boleto.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.addEventListener('load', () => {
    setTimeout(() => win.print(), 150);
  });
}
