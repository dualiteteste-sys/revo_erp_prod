type CsvCell = string | number | boolean | null | undefined;

function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  const needsQuotes = /[",\n\r;]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function downloadCsv(opts: {
  filename: string;
  headers: string[];
  rows: CsvCell[][];
  separator?: ',' | ';';
}): void {
  const separator = opts.separator ?? ';';
  const lines = [
    opts.headers.map((h) => csvEscape(h)).join(separator),
    ...opts.rows.map((r) => r.map((c) => csvEscape(c)).join(separator)),
  ];

  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.filename.endsWith('.csv') ? opts.filename : `${opts.filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

