import type { ImportarExtratoPayload } from '@/services/treasury';

const parseDateToISO = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const m = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
};

const parseMoney = (raw: string): number | null => {
  const value = raw.trim();
  if (!value) return null;
  const normalized = value
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const hashString = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export function parseOfxExtrato(text: string): ImportarExtratoPayload[] {
  const ledgerBalanceRaw =
    text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]+)/i)?.[1]?.trim() ??
    text.match(/<AVAILBAL>[\s\S]*?<BALAMT>([^<\r\n]+)/i)?.[1]?.trim() ??
    '';
  const ledgerBalance = ledgerBalanceRaw ? parseMoney(ledgerBalanceRaw) : null;

  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const itens: ImportarExtratoPayload[] = [];
  const signedDeltas: number[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const dt = b.match(/<DTPOSTED>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const trntype = (b.match(/<TRNTYPE>([^<\r\n]+)/i)?.[1]?.trim() ?? '').toUpperCase();
    const trnamtRaw = b.match(/<TRNAMT>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const fitid = b.match(/<FITID>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const checknum = b.match(/<CHECKNUM>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const name = b.match(/<NAME>([^<\r\n]+)/i)?.[1]?.trim() ?? '';
    const memo = b.match(/<MEMO>([^<\r\n]+)/i)?.[1]?.trim() ?? '';

    const dt8 = dt.match(/\d{8}/)?.[0] ?? '';
    const dataISO = parseDateToISO(dt8);
    const parsedAmount = parseMoney(trnamtRaw);
    const descricao = (memo || name || 'Lançamento').trim();
    const documento = (checknum || fitid || '').trim() || undefined;

    if (!dataISO || parsedAmount === null) continue;

    let signedAmount = parsedAmount;
    if (trntype === 'DEBIT' && signedAmount > 0) signedAmount = -signedAmount;
    if (trntype === 'CREDIT' && signedAmount < 0) signedAmount = Math.abs(signedAmount);

    const tipo = signedAmount >= 0 ? 'credito' : 'debito';
    const valorAbs = Math.abs(signedAmount);
    if (valorAbs <= 0) continue;

    const fitIdOrFallback = fitid || '';
    const raw = `${dataISO}|${descricao}|${signedAmount}|${documento ?? ''}|${fitIdOrFallback}|${trntype}|${i + 1}`;
    signedDeltas.push(signedAmount);
    itens.push({
      data_lancamento: dataISO,
      descricao,
      valor: valorAbs,
      tipo_lancamento: tipo,
      sequencia_importacao: i + 1,
      documento_ref: documento,
      identificador_banco: fitid || `OFX-${hashString(raw)}-${i + 1}`,
      hash_importacao: fitid
        ? hashString(`${dataISO}|${descricao}|${signedAmount}|${documento ?? ''}|${fitIdOrFallback}|${trntype}`)
        : hashString(raw),
      linha_bruta: raw,
    });
  }

  // OFX normalmente não traz saldo por transação, mas costuma trazer o saldo final do período (LEDGERBAL/AVAILBAL).
  // Quando disponível, derivamos o saldo_apos_lancamento por linha em ordem reversa.
  if (ledgerBalance !== null && Number.isFinite(ledgerBalance) && itens.length > 0 && signedDeltas.length === itens.length) {
    let running = ledgerBalance;
    for (let i = itens.length - 1; i >= 0; i -= 1) {
      itens[i].saldo_apos_lancamento = running;
      running = running - signedDeltas[i];
    }
  }

  return itens;
}

