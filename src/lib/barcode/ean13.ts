function normalizeDigits(raw: string): string {
  return String(raw ?? '').replace(/[^0-9]/g, '');
}

export function ean13CheckDigit(digits12: string): number | null {
  const s = normalizeDigits(digits12);
  if (!/^[0-9]{12}$/.test(s)) return null;

  let sumOdd = 0;
  let sumEven = 0;
  for (let i = 0; i < 12; i += 1) {
    const d = Number(s[i]);
    if ((i + 1) % 2 === 1) sumOdd += d;
    else sumEven += d;
  }
  return (10 - ((sumOdd + sumEven * 3) % 10)) % 10;
}

export function isValidEan13(raw: string): boolean {
  const s = normalizeDigits(raw);
  if (!/^[0-9]{13}$/.test(s)) return false;
  const expected = ean13CheckDigit(s.slice(0, 12));
  const got = Number(s[12]);
  return expected !== null && expected === got;
}

export function sanitizeBarcodeValue(raw: string): string {
  return String(raw ?? '').trim().replace(/\s+/g, '');
}

