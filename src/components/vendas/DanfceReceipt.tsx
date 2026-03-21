import React from 'react';
import type { VendaDetails } from '@/services/vendas';
import type { NfceEmissaoInfo } from '@/services/fiscalNfceEmissoes';

function formatMoneyBRL(n: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n ?? 0));
}

function formatChaveAcesso(chave: string): string {
  // Format 44-digit key in groups of 4
  return chave.replace(/(.{4})/g, '$1 ').trim();
}

type DanfceReceiptProps = {
  venda: VendaDetails;
  nfce: NfceEmissaoInfo;
  pagamentos?: Array<{ forma_pagamento: string; valor: number; valor_recebido?: number | null; troco?: number | null }>;
};

/**
 * Renders an NFC-e receipt in DANFCE format (80mm thermal style).
 * Inline component — no QR code library required (QR code available via PDF download).
 */
export default function DanfceReceipt({ venda, nfce, pagamentos }: DanfceReceiptProps) {
  const isAutorizada = nfce.status === 'autorizada';
  const isProcessando = nfce.status === 'processando' || nfce.status === 'enfileirada';

  return (
    <div className="font-mono text-xs leading-tight max-w-[320px] mx-auto">
      {/* Header */}
      <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
        <div className="font-bold text-sm">DANFE NFC-e</div>
        <div className="text-[10px] text-gray-600">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
      </div>

      {/* Pedido info */}
      <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
        <div>Pedido #{venda.numero}</div>
        <div>Data: {venda.data_emissao}</div>
        {venda.cliente_nome ? <div>Cliente: {venda.cliente_nome}</div> : null}
      </div>

      {/* Items */}
      <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
        <div className="font-bold mb-1">ITENS</div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-0.5">Item</th>
              <th className="text-right py-0.5">Qtd</th>
              <th className="text-right py-0.5">Unit.</th>
              <th className="text-right py-0.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {(venda.itens || []).map((it, i) => (
              <tr key={it.id || i}>
                <td className="py-0.5 max-w-[120px] truncate">{it.produto_nome || 'Produto'}</td>
                <td className="text-right py-0.5">{Number(it.quantidade || 0)}</td>
                <td className="text-right py-0.5">{formatMoneyBRL(Number(it.preco_unitario || 0))}</td>
                <td className="text-right py-0.5">{formatMoneyBRL(Number(it.total || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
        {Number(venda.desconto || 0) > 0 ? (
          <div className="flex justify-between">
            <span>Desconto:</span>
            <span>-{formatMoneyBRL(venda.desconto)}</span>
          </div>
        ) : null}
        {Number(venda.frete || 0) > 0 ? (
          <div className="flex justify-between">
            <span>Frete:</span>
            <span>{formatMoneyBRL(venda.frete)}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL:</span>
          <span>{formatMoneyBRL(venda.total_geral)}</span>
        </div>
      </div>

      {/* Payments */}
      {pagamentos && pagamentos.length > 0 ? (
        <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
          <div className="font-bold mb-1">PAGAMENTO</div>
          {pagamentos.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span>{p.forma_pagamento}</span>
              <span>{formatMoneyBRL(p.valor)}</span>
            </div>
          ))}
          {pagamentos.some((p) => p.troco && Number(p.troco) > 0) ? (
            <div className="flex justify-between text-gray-600">
              <span>Troco:</span>
              <span>
                {formatMoneyBRL(
                  pagamentos.reduce((sum, p) => sum + Number(p.troco || 0), 0)
                )}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* NFC-e fiscal data */}
      <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
        <div className="font-bold mb-1">DADOS FISCAIS</div>
        {isAutorizada ? (
          <>
            {nfce.numero ? (
              <div>NFC-e nº {nfce.numero}{nfce.serie ? ` série ${nfce.serie}` : ''}</div>
            ) : null}
            {nfce.chave_acesso ? (
              <div className="mt-1">
                <div className="text-[10px] text-gray-600 mb-0.5">Chave de acesso:</div>
                <div className="text-[9px] break-all font-mono">{formatChaveAcesso(nfce.chave_acesso)}</div>
              </div>
            ) : null}
            <div className="mt-1 text-[10px] text-green-700 font-semibold">
              NFC-e autorizada pela SEFAZ
              {nfce.ambiente === 'homologacao' ? ' (HOMOLOGAÇÃO)' : ''}
            </div>
          </>
        ) : isProcessando ? (
          <div className="text-[10px] text-amber-700 font-semibold">
            NFC-e em processamento pela SEFAZ…
          </div>
        ) : (
          <div className="text-[10px] text-gray-500">
            Status: {nfce.status}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-gray-500 mt-2">
        {nfce.ambiente === 'homologacao' ? (
          <div className="text-amber-600 font-bold mb-1">SEM VALOR FISCAL — HOMOLOGAÇÃO</div>
        ) : null}
        <div>Obrigado pela preferência!</div>
        <div className="mt-1 text-[9px]">Consulte pela chave de acesso em www.nfe.fazenda.gov.br/portal</div>
      </div>
    </div>
  );
}

/**
 * Builds printable HTML for 80mm thermal DANFCE receipt.
 */
export function buildDanfceHtml(
  venda: VendaDetails,
  nfce: NfceEmissaoInfo,
  pagamentos?: Array<{ forma_pagamento: string; valor: number; valor_recebido?: number | null; troco?: number | null }>,
): string {
  const isAutorizada = nfce.status === 'autorizada';
  const totalTroco = (pagamentos || []).reduce((s, p) => s + Number(p.troco || 0), 0);

  const itemsHtml = (venda.itens || [])
    .map(
      (it) => `<tr>
      <td style="padding:2px 0;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.produto_nome || 'Produto'}</td>
      <td style="padding:2px 0;text-align:right">${Number(it.quantidade || 0)}</td>
      <td style="padding:2px 0;text-align:right">${formatMoneyBRL(Number(it.preco_unitario || 0))}</td>
      <td style="padding:2px 0;text-align:right">${formatMoneyBRL(Number(it.total || 0))}</td>
    </tr>`,
    )
    .join('');

  const paymentsHtml = (pagamentos || [])
    .map(
      (p) =>
        `<div style="display:flex;justify-content:space-between"><span>${p.forma_pagamento}</span><span>${formatMoneyBRL(p.valor)}</span></div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>DANFCE #${venda.numero}</title>
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
    .chave { font-size: 8px; word-break: break-all; font-family: monospace; }
    @media print { button { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:12px">DANFE NFC-e</div>
  <div class="center small">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
  <div class="divider"></div>

  <div>Pedido #${venda.numero}</div>
  <div>Data: ${venda.data_emissao || ''}</div>
  ${venda.cliente_nome ? `<div>Cliente: ${venda.cliente_nome}</div>` : ''}
  <div class="divider"></div>

  <div class="bold">ITENS</div>
  <table>
    <thead><tr><th>Item</th><th class="right">Qtd</th><th class="right">Unit.</th><th class="right">Total</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="divider"></div>

  ${Number(venda.desconto || 0) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Desconto:</span><span>-${formatMoneyBRL(venda.desconto)}</span></div>` : ''}
  ${Number(venda.frete || 0) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Frete:</span><span>${formatMoneyBRL(venda.frete)}</span></div>` : ''}
  <div class="total-row" style="display:flex;justify-content:space-between">
    <span>TOTAL:</span><span>${formatMoneyBRL(venda.total_geral)}</span>
  </div>
  <div class="divider"></div>

  ${
    paymentsHtml
      ? `<div class="bold">PAGAMENTO</div>${paymentsHtml}${totalTroco > 0 ? `<div style="display:flex;justify-content:space-between;color:#666"><span>Troco:</span><span>${formatMoneyBRL(totalTroco)}</span></div>` : ''}<div class="divider"></div>`
      : ''
  }

  <div class="bold">DADOS FISCAIS</div>
  ${
    isAutorizada
      ? `${nfce.numero ? `<div>NFC-e nº ${nfce.numero}${nfce.serie ? ` série ${nfce.serie}` : ''}</div>` : ''}
         ${nfce.chave_acesso ? `<div class="small" style="margin-top:2px">Chave de acesso:</div><div class="chave">${formatChaveAcesso(nfce.chave_acesso)}</div>` : ''}
         <div style="margin-top:2px;font-size:10px;color:green;font-weight:bold">NFC-e autorizada pela SEFAZ${nfce.ambiente === 'homologacao' ? ' (HOMOLOGAÇÃO)' : ''}</div>`
      : `<div style="font-size:10px;color:#b45309;font-weight:bold">NFC-e em processamento…</div>`
  }
  <div class="divider"></div>

  <div class="center small" style="margin-top:4px">
    ${nfce.ambiente === 'homologacao' ? '<div style="color:#b45309;font-weight:bold">SEM VALOR FISCAL — HOMOLOGAÇÃO</div>' : ''}
    <div>Obrigado pela preferência!</div>
    <div style="font-size:8px;margin-top:2px">Consulte pela chave de acesso em www.nfe.fazenda.gov.br/portal</div>
  </div>

  <button onclick="window.print()" style="margin-top:8px;padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;border-radius:4px;font-size:11px;width:100%">Imprimir</button>
</body>
</html>`;
}
