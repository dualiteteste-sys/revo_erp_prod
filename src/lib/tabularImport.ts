import { normalizeHeader, parseCsv, type ParsedCsvRow } from "@/lib/csvImport";

export const TABULAR_IMPORT_ACCEPT =
  ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  const needsQuotes = /[",\n\r;]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsvPreview(rows: unknown[][], separator: ";" | "," = ";"): string {
  return rows
    .map((r) => r.map((c) => csvEscape(c)).join(separator))
    .join("\n");
}

function isSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls");
}

const COMMON_HEADER_HINTS = new Set([
  // parceiros
  "nome",
  "razao_social",
  "fantasia",
  "nome_fantasia",
  "tipo",
  "perfil",
  "categoria",
  "documento",
  "doc_unico",
  "cpf",
  "cnpj",
  "email",
  "telefone",
  "celular",
  "whatsapp",
  "cep",
  "logradouro",
  "endereco",
  "rua",
  "numero",
  "bairro",
  "complemento",
  "cidade",
  "municipio",
  "uf",
  "estado",
  // produtos/serviços (ajuda genérica)
  "sku",
  "codigo",
  "descricao",
  "preco",
  "preco_venda",
  "unidade",
  "ncm",
  "status",
]);

function hasAnyValue(row: unknown[]): boolean {
  return row.some((c) => String(c ?? "").trim() !== "");
}

function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const base = h || "";
    if (!base) return "";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

function scoreHeaderRow(rawRow: unknown[]): { score: number; nonEmpty: number; matches: number } {
  const normalized = rawRow.map((h) => normalizeHeader(String(h ?? ""))).filter(Boolean);
  const distinct = new Set(normalized);
  const matches = normalized.filter((h) => COMMON_HEADER_HINTS.has(h)).length;
  const nonEmpty = normalized.length;

  // Pontuação: prioriza "matches" em headers esperados, depois quantidade de headers distintos
  const score = matches * 10 + distinct.size;
  return { score, nonEmpty, matches };
}

export async function readTabularImportFile(file: File): Promise<{ text: string; rows: ParsedCsvRow[] }> {
  if (!isSpreadsheetFile(file)) {
    const text = await file.text();
    return { text, rows: parseCsv(text) };
  }

  const buf = await file.arrayBuffer();
  const XLSX = await import("xlsx");

  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return { text: "", rows: [] };
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return { text: "", rows: [] };

  // `header: 1` => matriz; a linha de cabeçalho pode não ser a primeira (arquivos legados costumam ter título/capas)
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  const withIndex = matrix
    .map((r, idx) => ({ idx1: idx + 1, row: Array.isArray(r) ? r : [] }))
    .map(({ idx1, row }) => ({ idx1, row: row.map((c) => (typeof c === "string" ? c.trim() : c)) }))
    .filter(({ row }) => hasAnyValue(row));
  if (withIndex.length < 2) return { text: "", rows: [] };

  // Escolhe a melhor candidata a "header row" nas primeiras linhas não vazias
  const candidates = withIndex.slice(0, 20);
  let headerPos = 0;
  let best = { score: -1, nonEmpty: 0, matches: 0 };
  for (let i = 0; i < candidates.length; i += 1) {
    const s = scoreHeaderRow(candidates[i].row);
    // exige um mínimo pra evitar pegar uma linha de título
    const isViable = s.matches >= 2 || s.nonEmpty >= 4;
    if (!isViable) continue;
    if (s.score > best.score) {
      best = s;
      headerPos = i;
    }
  }

  const headerRow = withIndex[headerPos].row as unknown[];
  const headers = uniqueHeaders(headerRow.map((h) => normalizeHeader(String(h ?? ""))));
  const rows: ParsedCsvRow[] = [];

  for (let i = headerPos + 1; i < withIndex.length; i += 1) {
    const cols = withIndex[i]?.row ?? [];
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      raw[h] = String((cols as any[])[idx] ?? "").trim();
    });
    // Mantém line aproximado (linha na planilha, 1-based) para debug no preview
    rows.push({ line: withIndex[i].idx1, raw });
  }

  const previewCsv = toCsvPreview(withIndex.slice(headerPos).map((x) => x.row), ";");
  return { text: previewCsv, rows };
}
