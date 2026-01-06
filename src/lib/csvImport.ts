export type ImportRow = Record<string, string>;

export type ParsedCsvRow = {
  line: number; // 1-based line number in source (including header)
  raw: ImportRow;
};

export function detectDelimiter(headerLine: string): ',' | ';' {
  const comma = (headerLine.match(/,/g) || []).length;
  const semicolon = (headerLine.match(/;/g) || []).length;
  return semicolon > comma ? ';' : ',';
}

export function normalizeHeader(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\w_]/g, '');
}

export function parseCsv(text: string): ParsedCsvRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map(normalizeHeader);

  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(delimiter).map((c) => c.trim());
    const row: ImportRow = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push({ line: i + 1, raw: row });
  }
  return rows;
}

export function digitsOnly(s: string) {
  return (s || '').replace(/\D/g, '');
}

export function parseMoneyBr(raw: string): number | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseBoolPt(raw: string): boolean | null {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (['1', 'true', 'sim', 's', 'yes', 'y'].includes(v)) return true;
  if (['0', 'false', 'nao', 'não', 'n', 'no'].includes(v)) return false;
  return null;
}

export function getFirst(row: ImportRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

