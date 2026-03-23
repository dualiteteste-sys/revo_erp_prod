/**
 * printOs — Impressão de Ordem de Serviço
 * Duas vias: "cliente" (com preços) e "tecnico" (sem preços, com obs internas).
 * Padrão: window.open() + HTML self-contained + window.print().
 */

import type { OrdemServicoDetails } from '@/services/os';

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
  mode: 'cliente' | 'tecnico';
  empresa: PrintOsEmpresa;
  logoUrl: string | null;
  clientDetails: PrintOsCliente | null;
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

// ── Main ─────────────────────────────────────────────

export function printOs(params: PrintOsParams): void {
  const { os, mode, empresa, logoUrl, clientDetails } = params;
  const isCliente = mode === 'cliente';

  const geradoEm = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

  const viaLabel = isCliente ? 'Via do Cliente' : 'Via do Técnico';

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
      `<strong>${esc(clientDetails.nome)}</strong>`,
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
    `<strong>O.S. Nº ${esc(String(os.numero))}</strong>`,
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
    if (isCliente) {
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

  // ── Totais (só via cliente) ──
  let totaisHtml = '';
  if (isCliente) {
    const totaisLines = [
      `<div class="totais-row"><span>Subtotal itens:</span><span>${fmtBRL(os.total_itens)}</span></div>`,
      os.desconto_valor ? `<div class="totais-row"><span>Desconto:</span><span class="val-neg">- ${fmtBRL(os.desconto_valor)}</span></div>` : '',
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

  // ── Observações ──
  let obsHtml = '';
  if (os.observacoes) {
    obsHtml = `
      <div class="section">
        <div class="section-title">Observações</div>
        <div class="section-body">${esc(os.observacoes).replace(/\n/g, '<br/>')}</div>
      </div>`;
  }

  // ── Observações internas (só via técnico) ──
  let obsInternasHtml = '';
  if (!isCliente && os.observacoes_internas) {
    obsInternasHtml = `
      <div class="section">
        <div class="section-title">Observações Internas</div>
        <div class="section-body obs-internas">${esc(os.observacoes_internas).replace(/\n/g, '<br/>')}</div>
      </div>`;
  }

  // ── Assinatura ──
  const sigLabel = isCliente ? 'Assinatura do Cliente' : 'Assinatura do Técnico';
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
      margin: 0; padding: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 9.5pt;
      color: #111827;
      background: #fff;
    }

    /* ── Header ──────────────────────────── */
    .header {
      display: flex;
      align-items: flex-start;
      gap: 14pt;
      border-bottom: 2px solid #1d4ed8;
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
      font-size: 13pt;
      font-weight: 800;
      color: #1d4ed8;
      margin: 0 0 2pt 0;
    }
    .empresa-line {
      font-size: 8pt;
      color: #374151;
      margin: 0;
    }
    .via-badge {
      display: inline-block;
      padding: 2pt 8pt;
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      border-radius: 3pt;
      color: #fff;
      background: ${isCliente ? '#1d4ed8' : '#059669'};
    }

    /* ── Info blocks ─────────────────────── */
    .info-row {
      display: flex;
      gap: 16pt;
      margin-bottom: 10pt;
    }
    .info-block {
      flex: 1;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 4pt;
      padding: 8pt 10pt;
    }
    .info-title {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4pt;
      color: #6b7280;
      margin-bottom: 4pt;
    }
    .info-line {
      font-size: 8.5pt;
      color: #111827;
      line-height: 1.5;
    }

    /* ── Sections ────────────────────────── */
    .section {
      margin-bottom: 10pt;
    }
    .section-title {
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3pt;
      color: #1d4ed8;
      border-bottom: 1px solid #dbeafe;
      padding-bottom: 3pt;
      margin-bottom: 6pt;
    }
    .section-body {
      font-size: 9pt;
      line-height: 1.5;
      color: #374151;
    }
    .obs-internas {
      background: #fffbeb;
      border: 1px dashed #fbbf24;
      border-radius: 4pt;
      padding: 6pt 8pt;
      color: #92400e;
    }

    /* ── Table ───────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead tr {
      background: #1d4ed8;
      color: #fff;
    }
    thead th {
      padding: 4pt 6pt;
      font-size: 7.5pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3pt;
      text-align: left;
    }
    thead th.num { text-align: right; }
    tbody tr { border-bottom: 1px solid #f3f4f6; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    td {
      padding: 4pt 6pt;
      font-size: 8.5pt;
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
      border-bottom: 1px solid #f3f4f6;
    }
    .totais-row.total-geral {
      font-weight: 800;
      font-size: 11pt;
      color: #1d4ed8;
      border-top: 2px solid #1d4ed8;
      border-bottom: none;
      padding-top: 6pt;
      margin-top: 2pt;
    }
    .val-neg { color: #991b1b; }

    /* ── Assinatura ──────────────────────── */
    .sig-block {
      margin-top: 40pt;
      text-align: center;
      page-break-inside: avoid;
    }
    .sig-line {
      width: 260pt;
      border-bottom: 1px solid #111827;
      margin: 0 auto 4pt auto;
    }
    .sig-label {
      font-size: 8.5pt;
      font-weight: 600;
      color: #374151;
    }
    .sig-date {
      font-size: 8pt;
      color: #6b7280;
      margin-top: 4pt;
    }

    /* ── Footer ──────────────────────────── */
    .report-footer {
      margin-top: 16pt;
      border-top: 1px solid #e5e7eb;
      padding-top: 6pt;
      display: flex;
      justify-content: space-between;
      font-size: 7pt;
      color: #9ca3af;
    }

    @media print {
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
