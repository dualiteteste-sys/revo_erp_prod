/**
 * printOs — Impressão de Ordem de Serviço
 * 3 vias:
 *   - "cliente_precos"  → Via do Cliente com preços (orçamento/faturamento)
 *   - "cliente"         → Via do Cliente sem preços (entregue na abertura)
 *   - "tecnico"         → Via do Técnico (sem preços, com obs internas)
 *
 * Padrão: window.open() + HTML self-contained + window.print().
 */

import type { OrdemServicoDetails } from '@/services/os';

export type PrintOsMode = 'cliente_precos' | 'cliente' | 'tecnico';

export type PrintOsEmpresa = {
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
};

export type PrintOsCliente = {
  nome: string;
  doc: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
};

export type PrintOsParams = {
  os: OrdemServicoDetails;
  mode: PrintOsMode;
  empresa: PrintOsEmpresa;
  logoUrl: string | null;
  clientDetails: PrintOsCliente | null;
  defaultObs?: string | null;
};

// ── Helpers ──────────────────────────────────────────

function esc(raw: string | null | undefined): string {
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
  return `${d}/${m}/${y}`;
}

function fmtCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return '';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
  return cnpj;
}

function fmtPct(value: number): string {
  if (!value) return '—';
  return `${value.toFixed(1)}%`;
}

const statusLabels: Record<string, string> = {
  orcamento: 'Orçamento',
  aberta: 'Aberta',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const viaLabels: Record<PrintOsMode, string> = {
  cliente_precos: 'Via do Cliente',
  cliente: 'Via do Cliente',
  tecnico: 'Via do Técnico',
};

// ── Main ─────────────────────────────────────────────

export function printOs(params: PrintOsParams): void {
  const { os, mode, empresa, logoUrl, clientDetails, defaultObs } = params;
  const showPrices = mode === 'cliente_precos';
  const isTecnico = mode === 'tecnico';

  const geradoEm = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

  const viaLabel = viaLabels[mode];

  // ── Logo ──
  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" class="logo" alt="Logo" />`
    : '';

  // ── Empresa info ──
  const cnpjFmt = fmtCnpj(empresa.cnpj);
  const empresaLines = [
    cnpjFmt ? `CNPJ: ${esc(cnpjFmt)}` : '',
    empresa.endereco ? esc(empresa.endereco) : '',
    [empresa.telefone ? `Tel: ${esc(empresa.telefone)}` : '', empresa.email ? esc(empresa.email) : ''].filter(Boolean).join(' — '),
  ].filter(Boolean);

  // ── Cliente info ──
  let clienteHtml = '';
  if (clientDetails) {
    const docFmt = fmtCnpj(clientDetails.doc);
    const clienteLines = [
      `<span class="medium">${esc(clientDetails.nome)}</span>`,
      docFmt ? `CPF/CNPJ: ${esc(docFmt)}` : '',
      clientDetails.endereco ? esc(clientDetails.endereco) : '',
      [clientDetails.telefone ? `Tel: ${esc(clientDetails.telefone)}` : '', clientDetails.email ? esc(clientDetails.email) : ''].filter(Boolean).join(' — '),
    ].filter(Boolean);
    clienteHtml = `
      <div class="info-block">
        <div class="info-title">Cliente</div>
        ${clienteLines.map(l => `<div class="info-line">${l}</div>`).join('')}
      </div>`;
  }

  // ── OS info ──
  const osInfoLines = [
    `<span class="medium">O.S. N\u00ba ${esc(String(os.numero))}</span>`,
    `Status: ${esc(statusLabels[os.status] ?? os.status)}`,
    os.tecnico_nome ? `Técnico: ${esc(os.tecnico_nome)}` : '',
    os.data_inicio ? `Data início: ${fmtDate(os.data_inicio)}` : '',
    os.data_prevista ? `Previsão: ${fmtDate(os.data_prevista)}` : '',
    os.hora ? `Horário: ${esc(os.hora)}` : '',
  ].filter(Boolean);

  // ── Descrição ──
  const descricaoHtml = os.descricao
    ? `<div class="section">
        <div class="section-title">Descrição</div>
        <div class="section-body">${esc(os.descricao).replace(/\n/g, '<br/>')}</div>
      </div>`
    : '';

  // ── Items table ──
  const itens = os.itens ?? [];
  let itemsHtml = '';
  if (itens.length > 0) {
    if (showPrices) {
      const rows = itens.map(it => `
        <tr>
          <td>${esc(it.codigo) || '—'}</td>
          <td>${esc(it.descricao)}</td>
          <td class="num">${it.quantidade}</td>
          <td class="num">${fmtBRL(it.preco)}</td>
          <td class="num">${fmtPct(it.desconto_pct)}</td>
          <td class="num">${fmtBRL(it.total)}</td>
        </tr>`).join('');
      itemsHtml = `
        <div class="section">
          <div class="section-title">Itens</div>
          <table>
            <thead><tr>
              <th>Código</th><th>Descrição</th><th class="num">Qtd</th>
              <th class="num">Preço Unit.</th><th class="num">Desc%</th><th class="num">Total</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } else {
      const rows = itens.map(it => `
        <tr>
          <td>${esc(it.codigo) || '—'}</td>
          <td>${esc(it.descricao)}</td>
          <td class="num">${it.quantidade}</td>
        </tr>`).join('');
      itemsHtml = `
        <div class="section">
          <div class="section-title">Itens / Serviços</div>
          <table>
            <thead><tr>
              <th>Código</th><th>Descrição</th><th class="num">Qtd</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }
  }

  // ── Totais (só via cliente com preços) ──
  let totaisHtml = '';
  if (showPrices) {
    const totaisLines = [
      `<div class="totais-row"><span>Subtotal itens:</span><span>${fmtBRL(os.total_itens)}</span></div>`,
      os.desconto_valor ? `<div class="totais-row"><span>Desconto:</span><span>- ${fmtBRL(os.desconto_valor)}</span></div>` : '',
      `<div class="totais-row total-geral"><span>Total:</span><span>${fmtBRL(os.total_geral)}</span></div>`,
      os.forma_recebimento ? `<div class="totais-row"><span>Forma de recebimento:</span><span>${esc(os.forma_recebimento)}</span></div>` : '',
      os.condicao_pagamento ? `<div class="totais-row"><span>Condição de pagamento:</span><span>${esc(os.condicao_pagamento)}</span></div>` : '',
    ].filter(Boolean);
    totaisHtml = `
      <div class="section">
        <div class="section-title">Valores</div>
        <div class="totais-block">${totaisLines.join('')}</div>
      </div>`;
  }

  // ── Observações (todas as vias — fallback para obs padrão da empresa) ──
  const obsText = os.observacoes || defaultObs || '';
  let obsHtml = '';
  if (obsText) {
    obsHtml = `
      <div class="section">
        <div class="section-title">Observações</div>
        <div class="section-body">${esc(obsText).replace(/\n/g, '<br/>')}</div>
      </div>`;
  }

  // ── Observações internas (só via técnico) ──
  let obsInternasHtml = '';
  if (isTecnico && os.observacoes_internas) {
    obsInternasHtml = `
      <div class="section">
        <div class="section-title">Observações Internas</div>
        <div class="section-body obs-internas">${esc(os.observacoes_internas).replace(/\n/g, '<br/>')}</div>
      </div>`;
  }

  // ── Assinatura ──
  const sigLabel = isTecnico ? 'Assinatura do Técnico' : 'Assinatura do Cliente';
  const sigHtml = `
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">${sigLabel}</div>
      <div class="sig-date">Data: ____/____/________</div>
    </div>`;

  // ── Full HTML ──
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>O.S. ${esc(String(os.numero))} — ${viaLabel}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 16mm; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 20pt 24pt;
      font-family: "Helvetica Neue", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif;
      font-weight: 300;
      font-size: 9.5pt;
      color: #333;
      background: #fff;
    }
    .medium { font-weight: 500; }

    /* ── Header ──────────────────────────── */
    .header {
      display: flex;
      align-items: flex-start;
      gap: 14pt;
      border-bottom: 1.5pt solid #666;
      padding-bottom: 10pt;
      margin-bottom: 12pt;
    }
    .logo {
      max-height: 60pt;
      max-width: 120pt;
      object-fit: contain;
    }
    .header-text { flex: 1; }
    .empresa-nome {
      font-size: 14pt;
      font-weight: 500;
      color: #222;
      margin: 0 0 2pt 0;
    }
    .empresa-line {
      font-size: 8pt;
      color: #555;
      font-weight: 300;
      margin: 0;
    }
    .via-badge {
      display: inline-block;
      padding: 3pt 10pt;
      font-size: 7.5pt;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.6pt;
      border: 1pt solid #666;
      color: #444;
    }

    /* ── Info blocks ─────────────────────── */
    .info-row {
      display: flex;
      gap: 16pt;
      margin-bottom: 10pt;
    }
    .info-block {
      flex: 1;
      border: 0.5pt solid #ccc;
      padding: 8pt 10pt;
    }
    .info-title {
      font-size: 7pt;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      color: #777;
      margin-bottom: 4pt;
    }
    .info-line {
      font-size: 8.5pt;
      color: #333;
      font-weight: 300;
      line-height: 1.6;
    }

    /* ── Sections ────────────────────────── */
    .section {
      margin-bottom: 10pt;
    }
    .section-title {
      font-size: 8pt;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.4pt;
      color: #444;
      border-bottom: 0.5pt solid #ccc;
      padding-bottom: 3pt;
      margin-bottom: 6pt;
    }
    .section-body {
      font-size: 9pt;
      font-weight: 300;
      line-height: 1.6;
      color: #444;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .obs-internas {
      background: #f7f7f7;
      border: 0.5pt dashed #aaa;
      padding: 6pt 8pt;
      color: #555;
    }

    /* ── Table ───────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead tr {
      background: #555;
      color: #fff;
    }
    thead th {
      padding: 4pt 6pt;
      font-size: 7pt;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.4pt;
      text-align: left;
    }
    thead th.num { text-align: right; }
    tbody tr { border-bottom: 0.5pt solid #e5e5e5; }
    tbody tr:nth-child(even) { background: #fafafa; }
    td {
      padding: 4pt 6pt;
      font-size: 8.5pt;
      font-weight: 300;
      vertical-align: middle;
    }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }

    /* ── Totais ──────────────────────────── */
    .totais-block {
      max-width: 300pt;
      margin-left: auto;
    }
    .totais-row {
      display: flex;
      justify-content: space-between;
      padding: 3pt 0;
      font-size: 9pt;
      font-weight: 300;
      border-bottom: 0.5pt solid #e5e5e5;
    }
    .totais-row.total-geral {
      font-weight: 500;
      font-size: 11pt;
      color: #222;
      border-top: 1.5pt solid #555;
      border-bottom: none;
      padding-top: 6pt;
      margin-top: 2pt;
    }

    /* ── Assinatura ──────────────────────── */
    .sig-block {
      margin-top: 40pt;
      text-align: center;
      page-break-inside: avoid;
    }
    .sig-line {
      width: 260pt;
      border-bottom: 0.5pt solid #555;
      margin: 0 auto 4pt auto;
    }
    .sig-label {
      font-size: 8pt;
      font-weight: 500;
      color: #333;
    }
    .sig-date {
      font-size: 7.5pt;
      font-weight: 300;
      color: #666;
      margin-top: 4pt;
    }

    /* ── Footer ──────────────────────────── */
    .report-footer {
      margin-top: 16pt;
      border-top: 0.5pt solid #ccc;
      padding-top: 6pt;
      display: flex;
      justify-content: space-between;
      font-size: 7pt;
      font-weight: 300;
      color: #999;
    }

    @media print {
      html, body { padding: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    ${logoHtml}
    <div class="header-text">
      <p class="empresa-nome">${esc(empresa.nome)}</p>
      ${empresaLines.map(l => `<p class="empresa-line">${l}</p>`).join('')}
    </div>
    <div><span class="via-badge">${viaLabel}</span></div>
  </div>

  <!-- OS + Cliente info -->
  <div class="info-row">
    <div class="info-block">
      <div class="info-title">Ordem de Serviço</div>
      ${osInfoLines.map(l => `<div class="info-line">${l}</div>`).join('')}
    </div>
    ${clienteHtml}
  </div>

  ${descricaoHtml}
  ${itemsHtml}
  ${totaisHtml}
  ${obsHtml}
  ${obsInternasHtml}
  ${sigHtml}

  <div class="report-footer">
    <span>Gerado em ${esc(geradoEm)}</span>
    <span>Ultria ERP</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=850,height=1100');
  if (!win) {
    alert('Permita pop-ups para este site para imprimir a O.S.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.addEventListener('load', () => {
    setTimeout(() => win.print(), 200);
  });
}
