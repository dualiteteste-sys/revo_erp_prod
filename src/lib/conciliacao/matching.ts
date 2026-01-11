export type MatchReason = {
  label: string;
  points: number;
};

export type MatchResult<T> = {
  item: T;
  score: number; // 0..100
  reasons: MatchReason[];
};

function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input: string): string[] {
  const norm = normalizeText(input);
  if (!norm) return [];
  return norm.split(' ').filter(Boolean);
}

function tokenOverlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const t of a) if (setB.has(t)) inter++;
  return inter / Math.max(a.length, b.length);
}

function absDaysDiff(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function scoreExtratoToMovimentacao(params: {
  extratoDescricao: string;
  extratoDocumento?: string | null;
  extratoValor: number;
  extratoDataISO: string;
  movDescricao?: string | null;
  movDocumento?: string | null;
  movValor: number;
  movDataISO: string;
}): { score: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];

  const valorExtrato = Number(params.extratoValor || 0);
  const valorMov = Number(params.movValor || 0);
  const diff = Math.abs(valorMov - valorExtrato);
  const rel = valorExtrato > 0 ? diff / valorExtrato : 1;

  let amountPoints = 0;
  if (diff === 0) amountPoints = 60;
  else if (diff <= 0.01) amountPoints = 55;
  else if (rel <= 0.001) amountPoints = 45;
  else if (rel <= 0.01) amountPoints = 30;
  else if (rel <= 0.05) amountPoints = 10;
  if (amountPoints) reasons.push({ label: diff === 0 ? 'valor exato' : `diferença valor: ${diff.toFixed(2)}`, points: amountPoints });

  const dExtrato = new Date(params.extratoDataISO);
  const dMov = new Date(params.movDataISO);
  const days = absDaysDiff(dExtrato, dMov);
  let datePoints = 0;
  if (days === 0) datePoints = 20;
  else if (days === 1) datePoints = 16;
  else if (days === 2) datePoints = 12;
  else if (days === 3) datePoints = 8;
  else if (days === 4) datePoints = 4;
  if (datePoints) reasons.push({ label: days === 0 ? 'mesma data' : `data ±${days}d`, points: datePoints });

  const descA = tokenize(params.extratoDescricao || '');
  const descB = tokenize(params.movDescricao || '');
  const overlap = tokenOverlapScore(descA, descB);
  let descPoints = Math.round(15 * overlap);
  const normExtrato = normalizeText(params.extratoDescricao || '');
  const normMov = normalizeText(params.movDescricao || '');
  if (normExtrato && normMov) {
    const longest = normExtrato.length >= normMov.length ? normExtrato : normMov;
    const shortest = normExtrato.length < normMov.length ? normExtrato : normMov;
    if (shortest.length >= 6 && longest.includes(shortest)) descPoints = Math.min(15, descPoints + 3);
  }
  if (descPoints) reasons.push({ label: 'texto similar', points: descPoints });

  const docExtrato = String(params.extratoDocumento || '').trim();
  const docMov = String(params.movDocumento || '').trim();
  let docPoints = 0;
  if (docExtrato && docMov && docExtrato === docMov) docPoints = 5;
  else if (docExtrato && (normMov.includes(normalizeText(docExtrato)) || normExtrato.includes(normalizeText(docMov)))) docPoints = 3;
  if (docPoints) reasons.push({ label: 'documento', points: docPoints });

  const score = Math.max(0, Math.min(100, amountPoints + datePoints + descPoints + docPoints));
  return { score, reasons };
}

export function rankCandidates<T>(candidates: Array<{ item: T; score: number; reasons: MatchReason[] }>): MatchResult<T>[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score)
    .map((c) => ({ item: c.item, score: c.score, reasons: c.reasons }));
}

