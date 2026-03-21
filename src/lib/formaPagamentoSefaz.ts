/**
 * Mapeamento centralizado de forma de pagamento → código SEFAZ (tPag).
 * Usado tanto no frontend (PdvPaymentModal) quanto referência para edge functions.
 */

export const SEFAZ_MAP: Record<string, string> = {
  'Dinheiro': '01',
  'Cheque': '02',
  'Cartao de credito': '03',
  'Cartão de crédito': '03',
  'Cartao de debito': '04',
  'Cartão de débito': '04',
  'Credito loja': '05',
  'Crédito loja': '05',
  'Vale alimentacao': '10',
  'Vale alimentação': '10',
  'Vale refeicao': '11',
  'Vale refeição': '11',
  'Vale presente': '12',
  'Vale combustivel': '13',
  'Vale combustível': '13',
  'Boleto': '15',
  'Deposito': '16',
  'Depósito': '16',
  'Pix': '17',
  'Transferencia': '18',
  'Transferência': '18',
  'TED/DOC': '18',
  'Sem pagamento': '90',
  'Outros': '99',
};

/** Resolve o código SEFAZ tPag para um nome de forma de pagamento. */
export function getSefazCode(formaPagamento: string): string {
  if (!formaPagamento) return '99';
  // Try direct match first
  if (SEFAZ_MAP[formaPagamento]) return SEFAZ_MAP[formaPagamento];
  // Try case-insensitive match
  const lower = formaPagamento.toLowerCase();
  for (const [key, val] of Object.entries(SEFAZ_MAP)) {
    if (key.toLowerCase() === lower) return val;
  }
  // If the value itself looks like a numeric code, return it
  if (/^\d{2}$/.test(formaPagamento)) return formaPagamento;
  return '99';
}

/** Quick-access payment options for PDV (most common). */
export const PDV_QUICK_PAYMENTS = [
  { label: 'Dinheiro', sefaz: '01' },
  { label: 'Pix', sefaz: '17' },
  { label: 'Cartao de credito', sefaz: '03' },
  { label: 'Cartao de debito', sefaz: '04' },
] as const;
