export type RenderBarcodeSvgParams = {
  value: string;
  type: 'CODE128' | 'EAN13';
  width?: number;
  height?: number;
  margin?: number;
};

type Segment = { isBar: boolean; width: number };

function escapeXml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Code 128 patterns (bar/space widths), indexed by code value 0..106.
// Source: ZXing Code128Reader.CODE_PATTERNS (Apache-2.0); copied to avoid runtime dependency on internal module paths.
const CODE128_PATTERNS: ReadonlyArray<ReadonlyArray<number>> = [
  [2, 1, 2, 2, 2, 2],
  [2, 2, 2, 1, 2, 2],
  [2, 2, 2, 2, 2, 1],
  [1, 2, 1, 2, 2, 3],
  [1, 2, 1, 3, 2, 2],
  [1, 3, 1, 2, 2, 2],
  [1, 2, 2, 2, 1, 3],
  [1, 2, 2, 3, 1, 2],
  [1, 3, 2, 2, 1, 2],
  [2, 2, 1, 2, 1, 3],
  [2, 2, 1, 3, 1, 2],
  [2, 3, 1, 2, 1, 2],
  [1, 1, 2, 2, 3, 2],
  [1, 2, 2, 1, 3, 2],
  [1, 2, 2, 2, 3, 1],
  [1, 1, 3, 2, 2, 2],
  [1, 2, 3, 1, 2, 2],
  [1, 2, 3, 2, 2, 1],
  [2, 2, 3, 2, 1, 1],
  [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1],
  [2, 1, 3, 2, 1, 2],
  [2, 2, 3, 1, 1, 2],
  [3, 1, 2, 1, 3, 1],
  [3, 1, 1, 2, 2, 2],
  [3, 2, 1, 1, 2, 2],
  [3, 2, 1, 2, 2, 1],
  [3, 1, 2, 2, 1, 2],
  [3, 2, 2, 1, 1, 2],
  [3, 2, 2, 2, 1, 1],
  [2, 1, 2, 1, 2, 3],
  [2, 1, 2, 3, 2, 1],
  [2, 3, 2, 1, 2, 1],
  [1, 1, 1, 3, 2, 3],
  [1, 3, 1, 1, 2, 3],
  [1, 3, 1, 3, 2, 1],
  [1, 1, 2, 3, 1, 3],
  [1, 3, 2, 1, 1, 3],
  [1, 3, 2, 3, 1, 1],
  [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3],
  [2, 3, 1, 3, 1, 1],
  [1, 1, 2, 1, 3, 3],
  [1, 1, 2, 3, 3, 1],
  [1, 3, 2, 1, 3, 1],
  [1, 1, 3, 1, 2, 3],
  [1, 1, 3, 3, 2, 1],
  [1, 3, 3, 1, 2, 1],
  [3, 1, 3, 1, 2, 1],
  [2, 1, 1, 3, 3, 1],
  [2, 3, 1, 1, 3, 1],
  [2, 1, 3, 1, 1, 3],
  [2, 1, 3, 3, 1, 1],
  [2, 1, 3, 1, 3, 1],
  [3, 1, 1, 1, 2, 3],
  [3, 1, 1, 3, 2, 1],
  [3, 3, 1, 1, 2, 1],
  [3, 1, 2, 1, 1, 3],
  [3, 1, 2, 3, 1, 1],
  [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1],
  [2, 2, 1, 4, 1, 1],
  [4, 3, 1, 1, 1, 1],
  [1, 1, 1, 2, 2, 4],
  [1, 1, 1, 4, 2, 2],
  [1, 2, 1, 1, 2, 4],
  [1, 2, 1, 4, 2, 1],
  [1, 4, 1, 1, 2, 2],
  [1, 4, 1, 2, 2, 1],
  [1, 1, 2, 2, 1, 4],
  [1, 1, 2, 4, 1, 2],
  [1, 2, 2, 1, 1, 4],
  [1, 2, 2, 4, 1, 1],
  [1, 4, 2, 1, 1, 2],
  [1, 4, 2, 2, 1, 1],
  [2, 4, 1, 2, 1, 1],
  [2, 2, 1, 1, 1, 4],
  [4, 1, 3, 1, 1, 1],
  [2, 4, 1, 1, 1, 2],
  [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2],
  [1, 2, 1, 1, 4, 2],
  [1, 2, 1, 2, 4, 1],
  [1, 1, 4, 2, 1, 2],
  [1, 2, 4, 1, 1, 2],
  [1, 2, 4, 2, 1, 1],
  [4, 1, 1, 2, 1, 2],
  [4, 2, 1, 1, 1, 2],
  [4, 2, 1, 2, 1, 1],
  [2, 1, 2, 1, 4, 1],
  [2, 1, 4, 1, 2, 1],
  [4, 1, 2, 1, 2, 1],
  [1, 1, 1, 1, 4, 3],
  [1, 1, 1, 3, 4, 1],
  [1, 3, 1, 1, 4, 1],
  [1, 1, 4, 1, 1, 3],
  [1, 1, 4, 3, 1, 1],
  [4, 1, 1, 1, 1, 3],
  [4, 1, 1, 3, 1, 1],
  [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1],
  [3, 1, 1, 1, 4, 1],
  [4, 1, 1, 1, 3, 1],
  [2, 1, 1, 4, 1, 2],
  [2, 1, 1, 2, 1, 4],
  [2, 1, 1, 2, 3, 2],
  [2, 3, 3, 1, 1, 1, 2],
];

const EAN13_FIRST_DIGIT_ENCODINGS: ReadonlyArray<number> = [0x0, 0xb, 0xd, 0xe, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a];

// EAN-13 L patterns (widths), alternating space/bar/space/bar and summing to 7 modules.
const EAN13_L_PATTERNS: ReadonlyArray<ReadonlyArray<number>> = [
  [3, 2, 1, 1],
  [2, 2, 2, 1],
  [2, 1, 2, 2],
  [1, 4, 1, 1],
  [1, 1, 3, 2],
  [1, 2, 3, 1],
  [1, 1, 1, 4],
  [1, 3, 1, 2],
  [1, 2, 1, 3],
  [3, 1, 1, 2],
];

function reverse4(a: ReadonlyArray<number>): [number, number, number, number] {
  return [a[3] ?? 0, a[2] ?? 0, a[1] ?? 0, a[0] ?? 0];
}

function encodeSegmentsFromWidths(widths: ReadonlyArray<number>, startingBar: boolean): Segment[] {
  const out: Segment[] = [];
  let isBar = startingBar;
  for (const w of widths) {
    if (w <= 0) continue;
    out.push({ isBar, width: w });
    isBar = !isBar;
  }
  return out;
}

function encodeCode128B(value: string): Segment[] {
  const v = String(value ?? '');
  if (!v) throw new Error('Código inválido.');

  const codes: number[] = [];
  for (let i = 0; i < v.length; i += 1) {
    const codePoint = v.charCodeAt(i);
    // Code 128 Set B supports ASCII 32..127
    if (codePoint < 32 || codePoint > 127) {
      throw new Error('Código interno contém caracteres inválidos para Code 128.');
    }
    codes.push(codePoint - 32);
  }

  const START_B = 104;
  let checksum = START_B;
  for (let i = 0; i < codes.length; i += 1) checksum += codes[i] * (i + 1);
  const checksumCode = checksum % 103;

  const sequence = [START_B, ...codes, checksumCode, 106];
  const segments: Segment[] = [];
  for (const code of sequence) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) throw new Error('Falha ao renderizar Code 128.');
    segments.push(...encodeSegmentsFromWidths(pattern, true));
  }
  return segments;
}

function encodeEan13(value: string): Segment[] {
  if (!/^\d{13}$/.test(value)) throw new Error('EAN-13 inválido.');
  const digits = value.split('').map((c) => Number(c));
  const first = digits[0] ?? 0;
  const parity = EAN13_FIRST_DIGIT_ENCODINGS[first] ?? 0;

  const segments: Segment[] = [];

  // Start guard 101
  segments.push({ isBar: true, width: 1 }, { isBar: false, width: 1 }, { isBar: true, width: 1 });

  // Left side digits (6): digits[1..6]
  for (let x = 0; x < 6; x += 1) {
    const digit = digits[x + 1] ?? 0;
    const useG = (parity & (1 << (5 - x))) !== 0;
    const widths = useG ? reverse4(EAN13_L_PATTERNS[digit]) : (EAN13_L_PATTERNS[digit] as ReadonlyArray<number>);
    segments.push(...encodeSegmentsFromWidths(widths, false));
  }

  // Middle guard 01010
  segments.push(
    { isBar: false, width: 1 },
    { isBar: true, width: 1 },
    { isBar: false, width: 1 },
    { isBar: true, width: 1 },
    { isBar: false, width: 1 },
  );

  // Right side digits (6): digits[7..12], R patterns = L widths but starting with bar
  for (let x = 0; x < 6; x += 1) {
    const digit = digits[x + 7] ?? 0;
    const widths = EAN13_L_PATTERNS[digit];
    segments.push(...encodeSegmentsFromWidths(widths, true));
  }

  // End guard 101
  segments.push({ isBar: true, width: 1 }, { isBar: false, width: 1 }, { isBar: true, width: 1 });

  return segments;
}

function toSegments(type: RenderBarcodeSvgParams['type'], value: string): Segment[] {
  if (type === 'EAN13') return encodeEan13(value);
  return encodeCode128B(value);
}

export function renderBarcodeSvg(params: RenderBarcodeSvgParams): string {
  const width = Math.max(120, params.width ?? 360);
  const height = Math.max(50, params.height ?? 96);
  const margin = Math.max(0, params.margin ?? 10);

  const segments = toSegments(params.type, params.value);
  const contentW = segments.reduce((acc, s) => acc + s.width, 0);
  const viewW = contentW + margin * 2;

  let rects = '';
  let x = margin;
  for (const seg of segments) {
    if (seg.isBar) rects += `<rect x="${x}" y="0" width="${seg.width}" height="${height}" />`;
    x += seg.width;
  }

  const label = escapeXml(params.value);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}">`,
    '<rect width="100%" height="100%" fill="white" />',
    `<g fill="black">${rects}</g>`,
    '</svg>',
  ].join('');
}
