/**
 * buildNonFiscalReceiptHtml — Recibo Não Fiscal para impressora térmica 80mm.
 *
 * Reutilizável por PDV e Pedidos de Venda.
 * Layout baseado no DANFCE (monospace, 80mm, dashed dividers).
 */

import type { VendaDetails } from '@/services/vendas';

function formatMoney(n: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));
}

export type NonFiscalReceiptParams = {
  venda: VendaDetails;
  pagamentos?: Array<{ forma_pagamento: string; valor: number; troco?: number }>;
  logoUrl?: string | null;
  empresaNome?: string;
  contaNome?: string;
};

export function buildNonFiscalReceiptHtml(params: NonFiscalReceiptParams): string {
  const { venda, pagamentos, logoUrl, empresaNome, contaNome } = params;

  const itemsHtml = (venda.itens || [])
    .map(
      (it) => `<tr>
      <td style="padding:2px 0;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.produto_nome || 'Produto'}</td>
      <td style="padding:2px 0;text-align:right">${Number(it.quantidade || 0)}</td>
      <td style="padding:2px 0;text-align:right">${formatMoney(it.preco_unitario)}</td>
      <td style="padding:2px 0;text-align:right">${formatMoney(it.total)}</td>
    </tr>`,
    )
    .join('');

  const totalTroco = (pagamentos || []).reduce((s, p) => s + Number(p.troco || 0), 0);
  const paymentsHtml = (pagamentos || [])
    .map(
      (p) =>
        `<div style="display:flex;justify-content:space-between"><span>${p.forma_pagamento}</span><span>${formatMoney(p.valor)}</span></div>`,
    )
    .join('');

  const logoHtml = logoUrl
    ? `<div class="center" style="margin-bottom:4px"><img src="${logoUrl}" alt="Logo" style="max-height:48px;object-fit:contain" /></div>`
    : '';
  const empresaNameHtml = empresaNome
    ? `<div class="center bold" style="font-size:12px">${empresaNome}</div>`
    : '';

  const now = new Date();
  const printTimestamp = now.toLocaleString('pt-BR');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Recibo #${venda.numero}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 80mm; padding: 4mm; line-height: 1.3; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #999; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; border-bottom: 1px solid #ccc; padding: 2px 0; }
    .right { text-align: right; }
    .small { font-size: 9px; color: #666; }
    .total-row { font-size: 13px; font-weight: bold; }
    .nf-badge { font-size: 12px; font-weight: bold; border: 1px dashed #999; padding: 2px 6px; display: inline-block; margin: 2px 0; }
    @media print { button { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  ${logoHtml}
  ${empresaNameHtml}
  <div class="center"><span class="nf-badge">RECIBO NÃO FISCAL</span></div>
  <div class="center small">Este documento não possui valor fiscal</div>
  <div class="divider"></div>

  <div>Pedido #${venda.numero}</div>
  <div>Data: ${venda.data_emissao || ''}</div>
  ${venda.cliente_nome ? `<div>Cliente: ${venda.cliente_nome}</div>` : ''}
  ${contaNome ? `<div class="small">Recebimento: ${contaNome}</div>` : ''}
  <div class="divider"></div>

  <div class="bold">ITENS</div>
  <table>
    <thead><tr><th>Item</th><th class="right">Qtd</th><th class="right">Unit.</th><th class="right">Total</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="divider"></div>

  ${Number(venda.desconto || 0) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Desconto:</span><span>-${formatMoney(venda.desconto)}</span></div>` : ''}
  ${Number(venda.frete || 0) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Frete:</span><span>${formatMoney(venda.frete)}</span></div>` : ''}
  <div class="total-row" style="display:flex;justify-content:space-between">
    <span>TOTAL:</span><span>${formatMoney(venda.total_geral)}</span>
  </div>
  <div class="divider"></div>

  ${
    paymentsHtml
      ? `<div class="bold">PAGAMENTO</div>${paymentsHtml}${totalTroco > 0 ? `<div style="display:flex;justify-content:space-between;color:#666"><span>Troco:</span><span>${formatMoney(totalTroco)}</span></div>` : ''}<div class="divider"></div>`
      : ''
  }

  ${venda.observacoes ? `<div class="small" style="margin-top:2px"><strong>Obs:</strong> ${venda.observacoes}</div><div class="divider"></div>` : ''}

  <div class="center small" style="margin-top:4px">
    <div>Obrigado pela preferência!</div>
    <div style="margin-top:2px">${printTimestamp}</div>
  </div>

  <button onclick="window.print()" style="margin-top:8px;padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;border-radius:4px;font-size:11px;width:100%">Imprimir</button>
</body>
</html>`;
}
